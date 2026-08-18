/**
 * korean-tts: Korean phonology engine, IPA converter, audio utilities,
 * model cache management, and KoreanSpeaker controller for Kokoro TTS WebAssembly.
 */

// High-level Speaker Controller
export {
  KoreanSpeaker,
  SynthesisCancelledError,
  DefaultSynthesisTask,
} from "./korean-speaker.ts";
export type {
  SpeakerInitOptions,
  SynthesisInput,
  TextSynthesisInput,
  IpaSynthesisInput,
  BaseSynthesisInput,
  SynthesisResult,
  SynthesisTask,
  SynthesisProgressStage,
  SynthesisProgressEvent,
  SynthesisProgressCallback,
  SpeakerProgressStatus,
  SpeakerProgress,
  SpeakerInitiateProgress,
  SpeakerDownloadProgress,
  SpeakerChunkProgress,
  SpeakerDoneProgress,
  SpeakerReadyProgress,
  SpeakerProgressCallback,
} from "./korean-speaker.ts";

// Korean Phonology & IPA Conversion Engine
export {
  koreanToIpa,
  convertKoreanToSpeechText,
  koreanToPronunciation,
  decomposeHangul,
  composeHangul,
  syllablesToHangul,
  applyPhonologicalRules,
  normalizeKoreanText,
  numberToKorean,
  numberToNativeKorean,
  isHangul,
  CHO_LIST,
  JUNG_LIST,
  JONG_LIST,
  CHO_IPA,
  JUNG_IPA,
  JONG_IPA,
  JAMO_CONSONANT_SYLLABLES,
  JAMO_VOWEL_SYLLABLES,
  KOKORO_VOICES,
  KOREAN_SENTENCE_PRESETS,
} from "./korean-engine.ts";

export type {
  DecomposedHangul,
  RawCharacter,
  SyllableToken,
  SentenceItem,
  SentenceCategory,
  VoiceConfig,
} from "./korean-engine.ts";

// Audio & Waveform Utilities
export { createWavBlob, Visualizer } from "./audio-utils.ts";

// Model Storage & Cache Management
export {
  getModelStorageInfo,
  deleteModelCache,
  requestPersistentStorage,
  isStoragePersisted,
  formatBytes,
} from "./storage-utils.ts";

export type { StorageInfo } from "./storage-utils.ts";
