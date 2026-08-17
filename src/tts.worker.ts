import { KoreanSpeaker, type SpeakerProgress } from "./korean-speaker";
import { KOKORO_VOICES, type VoiceConfig } from "./korean-engine";
import { getModelStorageInfo, deleteModelCache, type StorageInfo } from "./storage-utils";

/**
 * Dedicated Web Worker for Kokoro-82M TTS synthesis in the demo app.
 * Runs model downloading, WASM compilation, phoneme conversion, and ONNX neural network
 * inference completely off the main UI thread so that the browser interface remains
 * 100% responsive and animations (like the "Synthesizing..." spinner) run smoothly.
 */

let speaker: KoreanSpeaker | null = null;
let isModelLoaded = false;

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
    };

export type WorkerResponse =
  | { type: "STORAGE_INFO"; payload: StorageInfo }
  | { type: "STORAGE_CLEARED" }
  | { type: "LOAD_PROGRESS"; payload: SpeakerProgress }
  | { type: "LOAD_SUCCESS"; payload: { voices: VoiceConfig[] } }
  | { type: "LOAD_ERROR"; payload: { error: string } }
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
  | { type: "SYNTHESIS_ERROR"; payload: { id: string; error: string } };

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

    case "SYNTHESIZE": {
      const { id, text, ipa, voice, speed } = msg.payload;
      try {
        if (!speaker || !isModelLoaded) {
          throw new Error("Model is not loaded yet. Please wait for model loading to complete.");
        }

        const input = ipa
          ? { ipa, voice: voice || "jf_nezumi", speed: speed ?? 1.0 }
          : { text: text || "", voice: voice || "jf_nezumi", speed: speed ?? 1.0 };

        const result = await speaker.synthesize(input);

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
        postResponse({
          type: "SYNTHESIS_ERROR",
          payload: { id, error: err.message || "Synthesis failed" },
        });
      }
      break;
    }
  }
};
