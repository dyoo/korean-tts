import { env } from "@huggingface/transformers";
import {
  KoreanSpeaker,
  type SpeakerProgress,
  type SynthesisProgressEvent,
  type SynthesisTask,
} from "./korean-speaker";
import { KOKORO_VOICES, type VoiceConfig } from "./korean-engine";
import { getModelStorageInfo, deleteModelCache, type StorageInfo } from "./storage-utils";

/**
 * Configure ONNX WebAssembly execution backend for Web Worker compatibility across all browsers.
 *
 * Safari & Mobile WebKit Compatibility:
 * 1. WebKit/Safari DedicatedWorkerGlobalScope does not support nested Web Workers (calling `new Worker()`
 *    from inside a Worker). When multi-threaded WASM initializes with numThreads > 1 (or default 0),
 *    ONNX Runtime attempts to spawn sub-worker threads, which throws a ReferenceError/TypeError in Safari.
 * 2. Setting `numThreads = 1` forces ONNX Runtime WASM to run in single-threaded mode within this
 *    already-isolated dedicated Web Worker thread.
 * 3. Disable proxying (`proxy = false`) to avoid redundant main-thread worker proxies.
 */
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

/**
 * Dedicated Web Worker for Kokoro-82M TTS synthesis in the demo app.
 * Runs model downloading, WASM compilation, phoneme conversion, and ONNX neural network
 * inference completely off the main UI thread so that the browser interface remains
 * 100% responsive and animations run smoothly.
 */

let speaker: KoreanSpeaker | null = null;
let isModelLoaded = false;
const activeTasks = new Map<string, SynthesisTask>();

export type WorkerRequest =
  | { type: "CHECK_STORAGE" }
  | { type: "CLEAR_STORAGE" }
  | { type: "LOAD_MODEL"; payload: { dtype?: string; device?: string } }
  | {
      type: "SYNTHESIZE";
      payload: {
        id: string;
        text?: string;
        ipa?: string;
        voice?: string;
        speed?: number;
      };
    }
  | {
      type: "CANCEL_SYNTHESIS";
      payload?: {
        id?: string;
        reason?: string;
      };
    };

export type WorkerResponse =
  | { type: "STORAGE_INFO"; payload: StorageInfo }
  | { type: "STORAGE_CLEARED" }
  | { type: "LOAD_PROGRESS"; payload: SpeakerProgress }
  | { type: "LOAD_SUCCESS"; payload: { voices: VoiceConfig[] } }
  | { type: "LOAD_ERROR"; payload: { error: string } }
  | {
      type: "SYNTHESIS_PROGRESS";
      payload: {
        id: string;
        event: SynthesisProgressEvent;
      };
    }
  | {
      type: "SYNTHESIS_SUCCESS";
      payload: {
        id: string;
        audio: ArrayBuffer;
        sampleRate: number;
        durationSec: number;
        genTimeMs: number;
        rtf: number;
        ipa: string;
      };
    }
  | {
      type: "SYNTHESIS_CANCELLED";
      payload: {
        id: string;
        reason?: string;
      };
    }
  | { type: "SYNTHESIS_ERROR"; payload: { id: string; error: string; isCancelled?: boolean } };

function postResponse(msg: WorkerResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    (self as unknown as Worker).postMessage(msg);
  }
}

const DEFAULT_EMPTY_STORAGE: StorageInfo = {
  isCached: false,
  modelSizeBytes: 0,
  modelSizeFormatted: "0 MB",
  totalUsageBytes: 0,
  totalUsageFormatted: "0 MB",
  persisted: false,
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  switch (msg.type) {
    case "CHECK_STORAGE": {
      try {
        const info = await getModelStorageInfo();
        postResponse({ type: "STORAGE_INFO", payload: info });
      } catch (_) {
        postResponse({
          type: "STORAGE_INFO",
          payload: DEFAULT_EMPTY_STORAGE,
        });
      }
      break;
    }

    case "CLEAR_STORAGE": {
      try {
        if (speaker) {
          speaker.cancelAll("Cache cleared");
        }
        activeTasks.clear();
        await deleteModelCache();
        speaker = null;
        isModelLoaded = false;
        postResponse({ type: "STORAGE_CLEARED" });
      } catch (_) {
        postResponse({
          type: "STORAGE_INFO",
          payload: DEFAULT_EMPTY_STORAGE,
        });
      }
      break;
    }

    case "LOAD_MODEL": {
      try {
        const dtype = (msg.payload?.dtype || "q8") as any;
        const device = (msg.payload?.device || "wasm") as any;

        if (isModelLoaded && speaker) {
          postResponse({
            type: "LOAD_SUCCESS",
            payload: { voices: (speaker.getVoices() as VoiceConfig[]) || KOKORO_VOICES },
          });
          return;
        }

        speaker = new KoreanSpeaker({ dtype, device });

        await speaker.load({
          dtype,
          device,
          progressCallback: (progress: SpeakerProgress) => {
            postResponse({ type: "LOAD_PROGRESS", payload: progress });
          },
        });

        isModelLoaded = true;
        postResponse({
          type: "LOAD_SUCCESS",
          payload: { voices: (speaker.getVoices() as VoiceConfig[]) || KOKORO_VOICES },
        });
      } catch (err: any) {
        isModelLoaded = false;
        postResponse({
          type: "LOAD_ERROR",
          payload: { error: err.message || "Failed to load model" },
        });
      }
      break;
    }

    case "CANCEL_SYNTHESIS": {
      const targetId = msg.payload?.id;
      const reason = msg.payload?.reason || "Cancelled by user";

      if (targetId) {
        const task = activeTasks.get(targetId);
        if (task) {
          task.cancel(reason);
          activeTasks.delete(targetId);
          postResponse({
            type: "SYNTHESIS_CANCELLED",
            payload: { id: targetId, reason },
          });
        }
      } else {
        if (speaker) {
          speaker.cancelAll(reason);
        }
        for (const [id, task] of activeTasks.entries()) {
          task.cancel(reason);
          postResponse({
            type: "SYNTHESIS_CANCELLED",
            payload: { id, reason },
          });
        }
        activeTasks.clear();
      }
      break;
    }

    case "SYNTHESIZE": {
      const { id, text, ipa, voice, speed } = msg.payload;
      try {
        if (!speaker || !isModelLoaded) {
          throw new Error("Model is not loaded yet. Please wait for model loading to complete.");
        }

        const input = ipa
          ? { ipa, voice: voice || "jf_nezumi", speed: speed ?? 1.0 }
          : { text: text || "", voice: voice || "jf_nezumi", speed: speed ?? 1.0 };

        const task = speaker.synthesize(input);
        activeTasks.set(id, task);

        task.onProgress((progressEvent) => {
          postResponse({
            type: "SYNTHESIS_PROGRESS",
            payload: { id, event: progressEvent },
          });
        });

        const result = await task.promise;
        activeTasks.delete(id);

        // Copy audio Float32Array to independent transfer buffer
        const audioBuffer = result.audio.buffer.slice(
          result.audio.byteOffset,
          result.audio.byteOffset + result.audio.byteLength
        ) as ArrayBuffer;

        postResponse(
          {
            type: "SYNTHESIS_SUCCESS",
            payload: {
              id,
              audio: audioBuffer,
              sampleRate: result.sampleRate,
              durationSec: result.durationSec,
              genTimeMs: result.genTimeMs,
              rtf: result.rtf,
              ipa: result.ipa,
            },
          },
          [audioBuffer]
        );
      } catch (err: any) {
        activeTasks.delete(id);
        const isCancelled = err.isCancelled || err.name === "AbortError";
        if (isCancelled) {
          postResponse({
            type: "SYNTHESIS_CANCELLED",
            payload: { id, reason: err.message || "Synthesis was cancelled" },
          });
        } else {
          postResponse({
            type: "SYNTHESIS_ERROR",
            payload: { id, error: err.message || "Synthesis failed", isCancelled: false },
          });
        }
      }
      break;
    }
  }
};

/**
 * Global unhandled error handler for the worker context.
 * Forwards any uncaught runtime exceptions to the main thread with explicit error details.
 */
self.onerror = (
  event: Event | string,
  _source?: string,
  _lineno?: number,
  _colno?: number,
  error?: Error
) => {
  console.error("Unhandled TTS worker error:", event, error);
  const message =
    error?.message ||
    (typeof event === "string"
      ? event
      : "message" in event && typeof (event as { message?: unknown }).message === "string"
        ? (event as { message: string }).message
        : "Web Worker encountered an unexpected error");
  postResponse({
    type: "LOAD_ERROR",
    payload: { error: message },
  });
};

/**
 * Global unhandled promise rejection handler for the worker context.
 */
self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error("Unhandled TTS worker rejection:", event.reason);
  const message =
    event.reason instanceof Error
      ? event.reason.message
      : String(event.reason || "Unhandled worker rejection");
  postResponse({
    type: "LOAD_ERROR",
    payload: { error: message },
  });
};

