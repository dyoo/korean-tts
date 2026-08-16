# Korean Kokoro TTS — Phonology Engine & WASM Playground

A lightweight, zero-backend WebAssembly (WASM) and WebGPU speech synthesis engine and testing playground for running **Kokoro-82M TTS** on Korean sentences.

This package can be used as an **npm library** in your own web applications/PWAs, or run locally as an **interactive playground**.

---

## Library Usage (npm)

### 1. Installation

```bash
npm install korean-kokoro kokoro-js
```

### 2. High-Level `KoreanSpeaker` Example

`KoreanSpeaker` manages model downloading, caching, voice selection, Hangul-to-IPA phonology conversion, audio synthesis, and offline cache maintenance in one unified interface:

```typescript
import { KoreanSpeaker } from "korean-kokoro";

// 1. Initialize speaker instance
const speaker = new KoreanSpeaker({
  device: "wasm", // "wasm" or "webgpu"
  dtype: "q8",    // "q8" (~86MB), "fp32", "fp16", or "q4"
});

// 2. Load model with progress tracking (auto-cached in browser CacheStorage)
await speaker.load({
  progressCallback: (p) => {
    console.log(`Downloading: ${p.file} (${p.progress}%)`);
  },
});

// 3. Get supported voices (Japanese / Mandarin CJK voices tuned for syllable timing)
const voices = speaker.getVoices();
// [{ id: "zf_xiaobei", name: "Xiaobei", traits: "...", ... }, ...]

// 4. Synthesize speech from Korean text (or raw IPA)
const result = await speaker.synthesize({
  text: "안녕하세요! 반갑습니다.",
  voice: "zf_xiaobei",
  speed: 1.0,
});

// Or synthesize from pre-computed raw IPA directly:
// const result = await speaker.synthesize({
//   ipa: "annjʌŋhasejo! paŋkapsɯmnida.",
//   voice: "zf_xiaobei",
// });

// Access metrics & outputs
console.log(`Generated in ${result.genTimeMs}ms (${result.rtf.toFixed(2)}x RTF)`);
console.log(`IPA Payload: ${result.ipa}`);

// 5. Playback or download WAV
const wavBlob = result.toWavBlob();
const audioUrl = result.toAudioUrl();

// 6. Direct one-line speak & play
await speaker.speak({ text: "오늘도 좋은 하루 되세요!" });

// 7. Inspect or clear offline storage (PWA ready)
const storage = await speaker.getStorageInfo();
console.log(`Storage: ${storage.modelSizeFormatted} (Offline Cached: ${storage.isCached})`);

// Delete cached model from disk and release RAM when user opts out
// await speaker.clearStorage();
```

---

## API Reference (`korean-speaker`)

### `KoreanSpeaker` Methods

| Method | Parameters | Returns | Description |
| :--- | :--- | :--- | :--- |
| `constructor(options?)` | `SpeakerInitOptions?` | `KoreanSpeaker` | Creates a new speaker instance with default or custom backend config. |
| `load(options?)` | `SpeakerInitOptions?` | `Promise<void>` | Downloads and initializes the ONNX model into WASM or WebGPU. |
| `isLoaded()` | — | `boolean` | Returns `true` if the model is initialized and ready for synthesis. |
| `getBackend()` | — | `{ device, dtype, modelId }` | Returns active hardware device, precision, and model repo. |
| `getVoices()` | — | `VoiceConfig[]` | Returns all available voices with language, gender, and trait metadata. |
| `textToIpa(text)` | `koreanText: string` | `string` | Converts Korean text into normalized, phonetically assimilated IPA. |
| `getVoiceVector(name)` | `voiceName: string` | `Promise<Float32Array>` | Fetches and caches voice style embedding vector from CDN. |
| `preloadVoices(names)` | `voiceNames: string[]` | `Promise<void>` | Preloads multiple voice style vectors into memory. |
| `synthesize(input)` | `SynthesisInput` | `Promise<SynthesisResult>` | Synthesizes `{ text }` or `{ ipa }` into audio with performance metrics. |
| `speak(input)` | `SynthesisInput` | `Promise<{ result, audio }>` | Synthesizes and immediately begins audio playback via `HTMLAudioElement`. |
| `getStorageInfo()` | — | `Promise<StorageInfo>` | Inspects browser `CacheStorage` for offline model size and origin quota. |
| `clearStorage()` | — | `Promise<boolean>` | Deletes model weights from `CacheStorage` and frees WebAssembly RAM. |
| `dispose()` | — | `void` | Releases in-memory model instances and cached style vectors. |

### Exported Types & Interfaces

* **`SpeakerInitOptions`**: Configuration for model loading (`modelId`, `dtype`, `device`, `progressCallback`, `requestPersistence`).
* **`SynthesisInput`**: Discriminated union `{ text: string; voice?: string; speed?: number } | { ipa: string; voice?: string; speed?: number }`.
* **`SynthesisResult`**: Synthesis outputs (`audio: Float32Array`, `sampleRate`, `durationSec`, `genTimeMs`, `rtf`, `ipa`, `voice`, `speed`, `toWavBlob()`, `toAudioUrl()`, `createAudioElement()`).
* **`SpeakerProgress`**: Download progress payload (`status`, `progress`, `file`, `loaded`, `total`).
* **`SpeakerProgressCallback`**: `(progress: SpeakerProgress) => void`.
* **`StorageInfo`**: Offline cache inspection metrics (`isCached`, `modelSizeBytes`, `modelSizeFormatted`, `totalUsageBytes`, `totalUsageFormatted`, `persisted`).

---

## Low-Level Phonology & Audio Utilities

You can also import individual building blocks:

```typescript
import {
  koreanToIpa,
  decomposeHangul,
  createWavBlob,
  Visualizer,
} from "korean-kokoro";

// Phonetic Hangul-to-IPA transcription with assimilation rules
const ipa = koreanToIpa("감사합니다"); // -> "kamsahamnida"

// Convert raw Float32Array PCM samples to WAV Blob
const wavBlob = createWavBlob(float32Array, 24000);
```

---

## Running the Interactive Demo Playground

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
# Open http://localhost:5173

# 3. Build library package (ESM + CJS + .d.ts)
npm run build:lib

# 4. Build demo web app
npm run build:demo
```

---

## License

This project is licensed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
