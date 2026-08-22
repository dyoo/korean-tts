import "./stream-polyfill.ts";
import { KokoroTTS } from "kokoro-js";
import { Tensor, RawAudio, env } from "@huggingface/transformers";
import {
  convertKoreanToSpeechText,
  KOKORO_VOICES,
  type VoiceConfig,
} from "./korean-engine.ts";
import { createWavBlob } from "./audio-utils.ts";
import {
  getModelStorageInfo,
  deleteModelCache,
  requestPersistentStorage,
  type StorageInfo,
} from "./storage-utils.ts";

export type { StorageInfo };

// Ensure remote models can be downloaded from Hugging Face CDN
env.allowLocalModels = false;
env.allowRemoteModels = true;

// Configure ONNX WebAssembly backend for Web Worker & Safari compatibility.
// In Safari and mobile WebKit browsers, Web Workers do not support nested Web Workers
// (calling new Worker() inside a worker). When running in a Web Worker context,
// enforce single-threaded WASM execution (numThreads = 1) to prevent nested worker instantiation errors.
if (typeof self !== "undefined" && typeof window === "undefined" && env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

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
 * All valid execution stages during speech synthesis.
 */
export type SynthesisProgressStage =
  | "init"
  | "loading-model"
  | "converting-phonology"
  | "tokenizing"
  | "fetching-voice"
  | "inferencing"
  | "completed"
  | "cancelled"
  | "error";

/**
 * Progress event emitted during synthesis execution.
 */
export interface SynthesisProgressEvent {
  stage: SynthesisProgressStage;
  message?: string;
  progress?: number;
}

/**
 * Callback function to monitor stage-by-stage synthesis progress.
 */
export type SynthesisProgressCallback = (event: SynthesisProgressEvent) => void;

/**
 * Error thrown when speech synthesis is cancelled before completion.
 */
export class SynthesisCancelledError extends Error {
  readonly isCancelled: boolean = true;

  constructor(message: string = "Synthesis was cancelled") {
    super(message);
    this.name = "AbortError";
    Object.setPrototypeOf(this, SynthesisCancelledError.prototype);
  }
}

/**
 * A structured, cancelable task handle returned by `speaker.synthesize(...)`.
 *
 * Implements `PromiseLike<SynthesisResult>` so it can be directly `await`ed or chained with `.then()`,
 * while also exposing `.cancel()`, `.promise`, `.stage`, `.isCancelled`, `.isSettled`,
 * `.cancelReason`, and `.onProgress(...)`.
 */
export interface SynthesisTask extends PromiseLike<SynthesisResult> {
  /** The underlying Promise resolving to the SynthesisResult or rejecting on error/cancellation */
  readonly promise: Promise<SynthesisResult>;

  /** The current execution stage of synthesis */
  readonly stage: SynthesisProgressStage;

  /** True if synthesis was cancelled */
  readonly isCancelled: boolean;

  /** True if synthesis has finished (either completed, cancelled, or errored) */
  readonly isSettled: boolean;

  /** Cancellation reason if cancelled */
  readonly cancelReason?: string;

  /**
   * Cancels the synthesis call.
   * If synthesis is already completed or cancelled, this is a no-op.
   * @param reason Optional cancellation reason description.
   */
  cancel(reason?: string): void;

  /**
   * Registers a progress listener callback for synthesis stage updates.
   * Returns `this` for chaining.
   */
  onProgress(callback: SynthesisProgressCallback): this;

  /** Standard Promise `then` handler */
  then<TResult1 = SynthesisResult, TResult2 = never>(
    onfulfilled?: ((value: SynthesisResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;

  /** Standard Promise `catch` handler */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<SynthesisResult | TResult>;

  /** Standard Promise `finally` handler */
  finally(onfinally?: (() => void) | null): Promise<SynthesisResult>;
}

/**
 * Default internal implementation of `SynthesisTask`.
 */
export class DefaultSynthesisTask implements SynthesisTask {
  private _stage: SynthesisProgressStage = "init";
  private _isCancelled: boolean = false;
  private _isSettled: boolean = false;
  private _cancelReason?: string;
  private _progressListeners: SynthesisProgressCallback[] = [];

  readonly promise: Promise<SynthesisResult>;
  private _resolve!: (value: SynthesisResult) => void;
  private _reject!: (reason?: any) => void;

  constructor(initialCallback?: SynthesisProgressCallback) {
    if (initialCallback) {
      this._progressListeners.push(initialCallback);
    }

    this.promise = new Promise<SynthesisResult>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  get stage(): SynthesisProgressStage {
    return this._stage;
  }

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  get isSettled(): boolean {
    return this._isSettled;
  }

  get cancelReason(): string | undefined {
    return this._cancelReason;
  }

  onProgress(callback: SynthesisProgressCallback): this {
    this._progressListeners.push(callback);
    return this;
  }

  _emitProgress(stage: SynthesisProgressStage, message?: string, progress?: number): void {
    if (this._isSettled && stage !== "completed" && stage !== "cancelled" && stage !== "error") {
      return;
    }
    this._stage = stage;
    const event: SynthesisProgressEvent = { stage, message, progress };
    for (const listener of this._progressListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in synthesis progress listener:", err);
      }
    }
  }

  cancel(reason?: string): void {
    if (this._isSettled) return;
    this._isCancelled = true;
    this._isSettled = true;
    this._cancelReason = reason || "Synthesis was cancelled";
    this._emitProgress("cancelled", this._cancelReason);
    this._reject(new SynthesisCancelledError(this._cancelReason));
  }

  _complete(result: SynthesisResult): void {
    if (this._isSettled) return;
    this._isSettled = true;
    this._emitProgress("completed", "Synthesis completed successfully", 1.0);
    this._resolve(result);
  }

  _error(err: any): void {
    if (this._isSettled) return;
    this._isSettled = true;
    this._emitProgress("error", err?.message || "Synthesis error");
    this._reject(err);
  }

  then<TResult1 = SynthesisResult, TResult2 = never>(
    onfulfilled?: ((value: SynthesisResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<SynthesisResult | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<SynthesisResult> {
    return this.promise.finally(onfinally);
  }
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

  /**
   * Optional callback to receive stage-by-stage synthesis progress updates.
   */
  onProgress?: SynthesisProgressCallback;
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
  private activeTasks = new Set<SynthesisTask>();
  private inferenceQueue: Promise<void> = Promise.resolve();

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
   * Returns a snapshot array of all currently active or queued synthesis tasks.
   */
  getActiveTasks(): SynthesisTask[] {
    return Array.from(this.activeTasks);
  }

  /**
   * Cancels the most recently initiated active synthesis task.
   * @param reason Optional cancellation reason description.
   */
  cancelCurrent(reason?: string): void {
    const tasks = Array.from(this.activeTasks);
    if (tasks.length > 0) {
      tasks[tasks.length - 1].cancel(reason);
    }
  }

  /**
   * Cancels all currently active and queued synthesis tasks.
   * @param reason Optional cancellation reason description.
   */
  cancelAll(reason?: string): void {
    for (const task of this.activeTasks) {
      task.cancel(reason);
    }
    this.activeTasks.clear();
  }

  /**
   * Synthesizes Korean text or raw IPA phonemes into audio waveform with performance metrics.
   * Returns a `SynthesisTask` handle that can be directly `await`ed or inspected for progress and cancelled.
   * Automatically loads the model on first call if not already loaded.
   *
   * @param input Synthesis configuration object with either `text` (Hangul) or `ipa` (raw IPA).
   * @returns A `SynthesisTask` structured handle (PromiseLike) resolving to `SynthesisResult`.
   *
   * @example
   * ```typescript
   * // 1. Direct await usage (backward compatible)
   * const result = await speaker.synthesize({ text: "안녕하세요!" });
   *
   * // 2. Structured cancelable task usage
   * const task = speaker.synthesize({ text: "긴 문장 합성 중..." });
   * task.onProgress((e) => console.log(e.stage));
   * // Cancel when needed:
   * task.cancel();
   * ```
   */
  synthesize(input: SynthesisInput): SynthesisTask {
    const task = new DefaultSynthesisTask(input.onProgress);
    this.activeTasks.add(task);

    const cleanup = () => {
      this.activeTasks.delete(task);
    };

    task.finally(cleanup).catch(() => {});

    (async () => {
      try {
        if (task.isCancelled) return;

        // 1. Ensure Model is Loaded
        if (!this.ttsInstance) {
          task._emitProgress("loading-model", "Loading Kokoro TTS model...", 0.1);
          await this.load();
          if (task.isCancelled) return;
        }

        const voice = input.voice || "jf_nezumi";
        const speed = input.speed ?? 1.0;

        // 2. Phonology Conversion
        task._emitProgress("converting-phonology", "Converting Hangul to phonemes...", 0.25);
        const ipa = "ipa" in input ? input.ipa : this.textToIpa(input.text);

        if (task.isCancelled) return;

        if (!ipa.trim()) {
          throw new Error("Phonetic payload is empty");
        }

        const startTime = performance.now();

        if (task.isCancelled || !this.ttsInstance) return;

        // 3. Tokenize phonetic payload
        task._emitProgress("tokenizing", "Tokenizing phonetic payload...", 0.4);
        const { input_ids } = (this.ttsInstance as any).tokenizer(ipa, {
          truncation: true,
        });

        if (task.isCancelled) return;

        // 4. Fetch & slice voice embedding
        task._emitProgress("fetching-voice", "Preparing voice style embedding...", 0.55);
        const voiceTensor = await this.getVoiceVector(voice);

        if (task.isCancelled || !this.ttsInstance) return;

        const numTokens = input_ids.dims.at(-1);
        const sliceIndex = 256 * Math.min(Math.max(numTokens - 2, 0), 509);
        const styleSlice = voiceTensor.slice(sliceIndex, sliceIndex + 256);

        const modelInputs = {
          input_ids: input_ids,
          style: new Tensor("float32", styleSlice, [1, 256]),
          speed: new Tensor("float32", [speed], [1]),
        };

        // 5. Run neural inference sequentially through inferenceQueue for safe ONNX concurrency
        const runInference = async () => {
          if (task.isCancelled || !this.ttsInstance) return;
          task._emitProgress("inferencing", "Running neural speech synthesis...", 0.7);

          const { waveform } = await (this.ttsInstance as any).model(modelInputs);

          if (task.isCancelled) return;

          const rawAudio = new RawAudio(waveform.data, 24000);
          const elapsedMs = Math.round(performance.now() - startTime);
          const audioData = rawAudio.audio as Float32Array;
          const sampleRate = rawAudio.sampling_rate || 24000;
          const durationSec = audioData.length / sampleRate;
          const rtf = elapsedMs / 1000 / durationSec;

          const result: SynthesisResult = {
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

          task._complete(result);
        };

        this.inferenceQueue = this.inferenceQueue
          .then(() => runInference())
          .catch((err) => {
            if (!task.isSettled) {
              task._error(err);
            }
          });
      } catch (err: any) {
        if (!task.isSettled) {
          task._error(err);
        }
      }
    })().catch(() => {});

    return task;
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
    this.cancelAll("Cache cleared");
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
    this.cancelAll("Speaker disposed");
    this.ttsInstance = null;
    this.voiceCache.clear();
  }
}
