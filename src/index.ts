/**
 * korean-kokoro: Korean phonology engine, IPA converter, audio utilities,
 * model cache management, and KoreanSpeaker controller for Kokoro TTS WebAssembly.
 */

// High-level Speaker Controller
export { KoreanSpeaker } from "./korean-speaker";
export type {
  SpeakerInitOptions,
  SynthesisOptions,
  SynthesisResult,
  SpeakerProgress,
  SpeakerProgressCallback,
} from "./korean-speaker";

// Korean Phonology & IPA Conversion Engine
export {
  koreanToIpa,
  convertKoreanToSpeechText,
  decomposeHangul,
  applyPhonologicalRules,
  normalizeKoreanText,
  numberToKorean,
  isHangul,
  KOKORO_VOICES,
  KOREAN_SENTENCE_PRESETS,
} from "./korean-engine";

export type {
  DecomposedHangul,
  RawCharacter,
  SyllableToken,
  SentenceItem,
  SentenceCategory,
  VoiceConfig,
} from "./korean-engine";

// Audio & Waveform Utilities
export { createWavBlob, Visualizer } from "./audio-utils";

// Model Storage & Cache Management
export {
  getModelStorageInfo,
  deleteModelCache,
  requestPersistentStorage,
  isStoragePersisted,
  formatBytes,
} from "./storage-utils";

export type { StorageInfo } from "./storage-utils";
