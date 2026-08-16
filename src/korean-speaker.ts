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

/**
 * All valid lifecycle status values reported during model downloading and loading.
 */
export type SpeakerProgressStatus =
  | "initiate"
  | "download"
  | "progress"
  | "done"
  | "ready";

/**
 * Reported when a file download is initiated.
 */
export interface SpeakerInitiateProgress {
  status: "initiate";
  file: string;
  name?: string;
}

/**
 * Reported when the file download stream starts receiving data.
 */
export interface SpeakerDownloadProgress {
  status: "download";
  file: string;
  name?: string;
}

/**
 * Reported periodically during active chunk download with exact percentages and byte counts.
 */
export interface SpeakerChunkProgress {
  status: "progress";
  file: string;
  name?: string;
  progress: number;
  loaded: number;
  total: number;
}

/**
 * Reported when an individual file finishes downloading.
 */
export interface SpeakerDoneProgress {
  status: "done";
  file: string;
  name?: string;
}

/**
 * Reported when all model components are loaded into WebAssembly / WebGPU and ready.
 */
export interface SpeakerReadyProgress {
  status: "ready";
  task?: string;
  model?: string;
}

/**
 * Strongly-typed discriminated union for model loading progress events.
 */
export type SpeakerProgress =
  | SpeakerInitiateProgress
  | SpeakerDownloadProgress
  | SpeakerChunkProgress
  | SpeakerDoneProgress
  | SpeakerReadyProgress;

/**
 * Callback function to monitor model download progress.
 */
export type SpeakerProgressCallback = (progress: SpeakerProgress) => void;

/**
 * Options to configure the `KoreanSpeaker` instance and model loading.
 */
export interface SpeakerInitOptions {
  /**
   * Hugging Face model repository ID.
   * @default "onnx-community/Kokoro-82M-v1.0-ONNX"
   */
  modelId?: string;

  /**
   * Model quantization / data type.
   * - `"q8"`: 8-bit quantized weights (~86 MB), optimal for WASM CPU SIMD.
   * - `"fp32"`: 32-bit floating point (~320 MB), highest precision.
   * - `"fp16"`: 16-bit half-precision (~160 MB), optimal for WebGPU.
   * - `"q4"`: 4-bit quantized weights (~45 MB), experimental compact build.
   * @default "q8"
   */
  dtype?: "q8" | "fp32" | "fp16" | "q4";

  /**
   * Execution hardware backend.
   * - `"wasm"`: Multi-threaded WebAssembly with SIMD (recommended for mobile/PWA).
   * - `"webgpu"`: WebGPU hardware acceleration via JSEP.
   * @default "wasm"
   */
  device?: "wasm" | "webgpu";

  /**
   * Progress callback invoked when downloading weights and tokenizers from CDN.
   */
  progressCallback?: SpeakerProgressCallback;

  /**
   * Whether to automatically call `navigator.storage.persist()` to prevent
   * mobile browsers from evicting cached model weights under disk pressure.
   * @default true
   */
  requestPersistence?: boolean;
}

/**
 * Base synthesis options shared between text and IPA inputs.
 */
export interface BaseSynthesisInput {
  /**
   * Voice style identifier.
   * Supported voices include CJK syllable-timed voices:
   * - Japanese: `"jf_alpha"`, `"jf_gongitsune"`, `"jf_nezumi"`, `"jf_tebukuro"`, `"jm_kumo"`
   * - Mandarin: `"zf_xiaobei"`, `"zf_xiaoni"`, `"zf_xiaoxiao"`, `"zf_xiaoyi"`, `"zm_yunxi"`, `"zm_yunjian"`, `"zm_yunxia"`, `"zm_yunyang"`
   * @default "jf_nezumi"
   */
  voice?: string;

  /**
   * Speech rate multiplier (e.g., 0.8 = slower, 1.0 = normal, 1.25 = faster).
   * @default 1.0
   */
  speed?: number;
}

/**
 * Input parameters for synthesizing speech from Korean Hangul text.
 */
export interface TextSynthesisInput extends BaseSynthesisInput {
  /**
   * Korean Hangul text to synthesize.
   * The text is automatically normalized (numbers, time, dates) and converted
   * into phonetically assimilated IPA monophthongs.
   */
  text: string;
}

/**
 * Input parameters for synthesizing speech directly from pre-computed raw IPA phonemes.
 */
export interface IpaSynthesisInput extends BaseSynthesisInput {
  /**
   * Raw International Phonetic Alphabet (IPA) phonetic string.
   * Bypasses Hangul phonology conversion.
   */
  ipa: string;
}

/**
 * Discriminated union input accepted by `speaker.synthesize(...)` and `speaker.speak(...)`.
 * Accepts either `{ text: "한국어" }` or `{ ipa: "annjʌŋhasejo" }`.
 */
export type SynthesisInput = TextSynthesisInput | IpaSynthesisInput;

/**
 * Result object returned after successful speech synthesis.
 */
export interface SynthesisResult {
  /** Raw 32-bit float PCM audio samples normalized to [-1.0, 1.0] */
  audio: Float32Array;

  /** Audio sampling rate in Hz (Kokoro uses 24000 Hz) */
  sampleRate: number;

  /** Audio duration in seconds */
  durationSec: number;

  /** Neural synthesis execution time in milliseconds */
  genTimeMs: number;

  /**
   * Real-Time Factor (RTF).
   * Values < 1.0 mean generation is faster than real-time playback
   * (e.g. 0.08x means 1 second of audio was generated in 80ms).
   */
  rtf: number;

  /** The resolved IPA phonetic string sent to the model tokenizer */
  ipa: string;

  /** Voice identifier used for synthesis */
  voice: string;

  /** Speech speed multiplier used */
  speed: number;

  /**
   * Encodes the raw PCM samples into a standard 16-bit PCM WAV Blob.
   * @returns A `Blob` of type `"audio/wav"`
   */
  toWavBlob: () => Blob;

  /**
   * Creates an object URL pointing to the synthesized WAV Blob.
   * Remember to call `URL.revokeObjectURL(url)` when finished.
   * @returns A string URL (`blob:...`)
   */
  toAudioUrl: () => string;

  /**
   * Creates a playable `HTMLAudioElement` configured with the WAV audio.
   * @returns An `HTMLAudioElement` ready for `.play()`
   */
  createAudioElement: () => HTMLAudioElement;
}

/**
 * Main high-level controller for Korean speech synthesis with Kokoro-82M TTS.
 * Handles model lifecycle, voice style embedding management, Hangul-to-IPA conversion,
 * neural inference, and browser offline storage maintenance.
 */
export class KoreanSpeaker {
  private ttsInstance: KokoroTTS | null = null;
  private voiceCache = new Map<string, Float32Array>();
  private modelId: string = "onnx-community/Kokoro-82M-v1.0-ONNX";
  private device: "wasm" | "webgpu" = "wasm";
  private dtype: "q8" | "fp32" | "fp16" | "q4" = "q8";
  private isModelLoading: boolean = false;

  /**
   * Creates a new `KoreanSpeaker` instance.
   * @param options Configuration options for backend device and precision.
   */
  constructor(options?: SpeakerInitOptions) {
    if (options?.modelId) this.modelId = options.modelId;
    if (options?.device) this.device = options.device;
    if (options?.dtype) this.dtype = options.dtype;
  }

  /**
   * Check if the Kokoro ONNX model is loaded and ready for synthesis.
   * @returns `true` if model weights are loaded in memory; otherwise `false`.
   */
  isLoaded(): boolean {
    return this.ttsInstance !== null;
  }

  /**
   * Returns current backend configuration and model repository ID.
   */
  getBackend(): { device: string; dtype: string; modelId: string } {
    return {
      device: this.device,
      dtype: this.dtype,
      modelId: this.modelId,
    };
  }

  /**
   * Loads the Kokoro ONNX model into WebAssembly or WebGPU.
   * Model weights are streamed on-demand from the CDN and saved in browser `CacheStorage`
   * for zero-latency subsequent runs and offline execution.
   *
   * @param options Optional overrides for device, precision, and progress monitoring.
   * @throws Error if model download or compilation fails.
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
   * Get the list of all available voices recommended for Korean speech.
   * Includes metadata such as gender, language origin, grade, and vocal traits.
   *
   * @returns An array of `VoiceConfig` objects.
   */
  getVoices(): VoiceConfig[] {
    return [...KOKORO_VOICES];
  }

  /**
   * Converts Korean Hangul text into phonetically assimilated IPA monophthongs.
   * Normalizes numbers, dates, times, and applies standard Korean phonology rules
   * (연음, 비음화, 유음화, 격음화, 구개음화).
   *
   * @param koreanText Korean Hangul string (e.g. "안녕하세요").
   * @returns IPA phonetic string (e.g. "annjʌŋhasejo").
   */
  textToIpa(koreanText: string): string {
    return convertKoreanToSpeechText(koreanText);
  }

  /**
   * Fetches and caches a voice style embedding vector on-demand from the CDN / CacheStorage.
   *
   * @param voiceName Voice identifier (e.g. `"zf_xiaobei"`, `"jf_alpha"`).
   * @returns A `Float32Array` containing the voice style tensor.
   * @throws Error if voice file cannot be retrieved.
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
   * Preloads multiple voice style embedding vectors into memory ahead of time.
   *
   * @param voiceNames Array of voice identifiers (e.g. `["zf_xiaobei", "jf_alpha"]`).
   */
  async preloadVoices(voiceNames: string[]): Promise<void> {
    await Promise.all(voiceNames.map((name) => this.getVoiceVector(name)));
  }

  /**
   * Synthesizes Korean text or raw IPA phonemes into audio waveform with performance metrics.
   * Automatically loads the model on first call if not already loaded.
   *
   * @param input Synthesis configuration object with either `text` (Hangul) or `ipa` (raw IPA).
   * @returns A `Promise` resolving to a `SynthesisResult` object containing audio and helper methods.
   *
   * @example
   * ```typescript
   * const result = await speaker.synthesize({
   *   text: "안녕하세요! 반갑습니다.",
   *   voice: "jf_nezumi",
   *   speed: 1.0,
   * });
   * const wavBlob = result.toWavBlob();
   * ```
   */
  async synthesize(input: SynthesisInput): Promise<SynthesisResult> {
    if (!this.ttsInstance) {
      await this.load();
    }

    const voice = input.voice || "jf_nezumi";
    const speed = input.speed ?? 1.0;
    const ipa = "ipa" in input ? input.ipa : this.textToIpa(input.text);

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
   * Convenience helper to synthesize speech and immediately begin playback.
   *
   * @param input Synthesis configuration object with either `text` or `ipa`.
   * @returns An object containing the `SynthesisResult` and active `HTMLAudioElement`.
   *
   * @example
   * ```typescript
   * await speaker.speak({ text: "오늘도 좋은 하루 되세요!" });
   * ```
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
   * Inspect offline `CacheStorage` usage and determine if Kokoro weights are cached.
   *
   * @returns A `StorageInfo` summary with byte counts, human-formatted sizes, and persistence status.
   */
  async getStorageInfo(): Promise<StorageInfo> {
    return await getModelStorageInfo();
  }

  /**
   * Deletes cached model and voice files from browser `CacheStorage` and frees in-memory RAM.
   *
   * @returns `true` if cache was successfully deleted; otherwise `false`.
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
   * Releases in-memory model instances and cached voice style tensors from WebAssembly RAM.
   */
  dispose(): void {
    this.ttsInstance = null;
    this.voiceCache.clear();
  }
}
