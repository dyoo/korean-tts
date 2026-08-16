import { KokoroTTS } from "kokoro-js";
import { Tensor, RawAudio, env } from "@huggingface/transformers";
import {
  convertKoreanToSpeechText,
  KOKORO_VOICES,
  type VoiceConfig,
} from "./korean-engine";
import { createWavBlob } from "./audio-utils";
import {
  getModelStorageInfo,
  deleteModelCache,
  requestPersistentStorage,
  type StorageInfo,
} from "./storage-utils";

export type { StorageInfo };

// Ensure remote models can be downloaded from Hugging Face CDN
env.allowLocalModels = false;
env.allowRemoteModels = true;

export interface SpeakerProgress {
  status: string;
  progress?: number;
  file?: string;
  loaded?: number;
  total?: number;
}

export type SpeakerProgressCallback = (progress: SpeakerProgress) => void;

export interface SpeakerInitOptions {
  modelId?: string;
  dtype?: "q8" | "fp32" | "fp16" | "q4";
  device?: "wasm" | "webgpu";
  progressCallback?: SpeakerProgressCallback;
  requestPersistence?: boolean;
}

export interface BaseSynthesisInput {
  voice?: string;
  speed?: number;
}

export interface TextSynthesisInput extends BaseSynthesisInput {
  text: string;
  ipa?: never;
}

export interface IpaSynthesisInput extends BaseSynthesisInput {
  ipa: string;
  text?: never;
}

export type SynthesisInput = TextSynthesisInput | IpaSynthesisInput;

export interface SynthesisResult {
  audio: Float32Array;
  sampleRate: number;
  durationSec: number;
  genTimeMs: number;
  rtf: number;
  ipa: string;
  voice: string;
  speed: number;
  toWavBlob: () => Blob;
  toAudioUrl: () => string;
  createAudioElement: () => HTMLAudioElement;
}

export class KoreanSpeaker {
  private ttsInstance: KokoroTTS | null = null;
  private voiceCache = new Map<string, Float32Array>();
  private modelId: string = "onnx-community/Kokoro-82M-v1.0-ONNX";
  private device: "wasm" | "webgpu" = "wasm";
  private dtype: "q8" | "fp32" | "fp16" | "q4" = "q8";
  private isModelLoading: boolean = false;

  constructor(options?: SpeakerInitOptions) {
    if (options?.modelId) this.modelId = options.modelId;
    if (options?.device) this.device = options.device;
    if (options?.dtype) this.dtype = options.dtype;
  }

  /**
   * Check if the Kokoro ONNX model is loaded and ready for synthesis.
   */
  isLoaded(): boolean {
    return this.ttsInstance !== null;
  }

  /**
   * Returns current backend device and data type.
   */
  getBackend(): { device: string; dtype: string; modelId: string } {
    return {
      device: this.device,
      dtype: this.dtype,
      modelId: this.modelId,
    };
  }

  /**
   * Load the Kokoro ONNX model into WebAssembly/WebGPU.
   */
  async load(options?: SpeakerInitOptions): Promise<void> {
    if (this.ttsInstance) return;
    if (this.isModelLoading) {
      throw new Error("Model is currently loading");
    }

    if (options?.modelId) this.modelId = options.modelId;
    if (options?.device) this.device = options.device;
    if (options?.dtype) this.dtype = options.dtype;

    this.isModelLoading = true;

    try {
      if (options?.requestPersistence !== false) {
        await requestPersistentStorage().catch(() => {});
      }

      this.ttsInstance = await KokoroTTS.from_pretrained(this.modelId, {
        dtype: this.dtype,
        device: this.device,
        progress_callback: options?.progressCallback,
      });
    } finally {
      this.isModelLoading = false;
    }
  }

  /**
   * Get the list of all available and curated voices for Korean speech.
   */
  getVoices(): VoiceConfig[] {
    return [...KOKORO_VOICES];
  }

  /**
   * Convert Korean text (Hangul) into phonetically assimilated IPA monophthongs.
   */
  textToIpa(koreanText: string): string {
    return convertKoreanToSpeechText(koreanText);
  }

  /**
   * Fetch and cache voice style tensor on-demand from CDN / browser CacheStorage.
   */
  async getVoiceVector(voiceName: string): Promise<Float32Array> {
    if (this.voiceCache.has(voiceName)) {
      return this.voiceCache.get(voiceName)!;
    }

    const cdnUrl = `https://huggingface.co/${this.modelId}/resolve/main/voices/${voiceName}.bin`;
    let buffer: ArrayBuffer | null = null;

    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const cache = await caches.open("kokoro-voices");
        const matched = await cache.match(cdnUrl);
        if (matched) {
          buffer = await matched.arrayBuffer();
        }
      } catch (_) {}
    }

    if (!buffer) {
      const res = await fetch(cdnUrl);
      if (!res.ok) {
        throw new Error(`Could not fetch voice vector for '${voiceName}' from ${cdnUrl}`);
      }
      const clone = res.clone();
      buffer = await res.arrayBuffer();

      if (typeof window !== "undefined" && "caches" in window) {
        try {
          const cache = await caches.open("kokoro-voices");
          await cache.put(cdnUrl, clone);
        } catch (_) {}
      }
    }

    const float32Array = new Float32Array(buffer);
    this.voiceCache.set(voiceName, float32Array);
    return float32Array;
  }

  /**
   * Preload multiple voice style embeddings into cache.
   */
  async preloadVoices(voiceNames: string[]): Promise<void> {
    await Promise.all(voiceNames.map((name) => this.getVoiceVector(name)));
  }

  /**
   * Synthesize Korean text ({ text: '...' }) or IPA phonemes ({ ipa: '...' })
   * into audio with performance metrics.
   */
  async synthesize(input: SynthesisInput): Promise<SynthesisResult> {
    if (!this.ttsInstance) {
      await this.load();
    }

    const voice = input.voice || "zf_xiaobei";
    const speed = input.speed ?? 1.0;
    const ipa = typeof input.ipa === "string" ? input.ipa : this.textToIpa(input.text);

    if (!ipa.trim()) {
      throw new Error("Phonetic payload is empty");
    }

    const startTime = performance.now();

    // 1. Tokenize phonetic payload
    const { input_ids } = (this.ttsInstance as any).tokenizer(ipa, {
      truncation: true,
    });

    // 2. Fetch & slice voice embedding
    const voiceTensor = await this.getVoiceVector(voice);
    const numTokens = input_ids.dims.at(-1);
    const sliceIndex = 256 * Math.min(Math.max(numTokens - 2, 0), 509);
    const styleSlice = voiceTensor.slice(sliceIndex, sliceIndex + 256);

    const modelInputs = {
      input_ids: input_ids,
      style: new Tensor("float32", styleSlice, [1, 256]),
      speed: new Tensor("float32", [speed], [1]),
    };

    // 3. Run neural inference
    const { waveform } = await (this.ttsInstance as any).model(modelInputs);
    const rawAudio = new RawAudio(waveform.data, 24000);

    const elapsedMs = Math.round(performance.now() - startTime);
    const audioData = rawAudio.audio as Float32Array;
    const sampleRate = rawAudio.sampling_rate || 24000;
    const durationSec = audioData.length / sampleRate;
    const rtf = elapsedMs / 1000 / durationSec;

    return {
      audio: audioData,
      sampleRate,
      durationSec,
      genTimeMs: elapsedMs,
      rtf,
      ipa,
      voice,
      speed,
      toWavBlob: () => createWavBlob(audioData, sampleRate),
      toAudioUrl: () => URL.createObjectURL(createWavBlob(audioData, sampleRate)),
      createAudioElement: () => {
        const blob = createWavBlob(audioData, sampleRate);
        const url = URL.createObjectURL(blob);
        return new Audio(url);
      },
    };
  }

  /**
   * Convenience helper to synthesize speech and immediately play it.
   */
  async speak(
    input: SynthesisInput
  ): Promise<{ result: SynthesisResult; audio: HTMLAudioElement }> {
    const result = await this.synthesize(input);
    const audio = result.createAudioElement();
    await audio.play();
    return { result, audio };
  }

  /**
   * Inspect offline CacheStorage usage.
   */
  async getStorageInfo(): Promise<StorageInfo> {
    return await getModelStorageInfo();
  }

  /**
   * Delete cached model and voice files from CacheStorage and release in-memory RAM.
   */
  async clearStorage(): Promise<boolean> {
    const deleted = await deleteModelCache();
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        await caches.delete("kokoro-voices");
      } catch (_) {}
    }
    this.dispose();
    return deleted;
  }

  /**
   * Release in-memory model instances and tensors from WebAssembly RAM.
   */
  dispose(): void {
    this.ttsInstance = null;
    this.voiceCache.clear();
  }
}
