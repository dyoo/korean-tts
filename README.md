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
// [{ id: "jf_nezumi", name: "Nezumi", traits: "...", ... }, ...]

// 4. Synthesize speech from Korean text (or raw IPA)
const result = await speaker.synthesize({
  text: "안녕하세요! 반갑습니다.",
  voice: "jf_nezumi", // Default: jf_nezumi
  speed: 1.0,
});

// Or synthesize from pre-computed raw IPA directly:
// const result = await speaker.synthesize({
//   ipa: "annjʌŋhasejo! paŋkapsɯmnida.",
//   voice: "jf_nezumi",
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
* **`SpeakerProgress`**: Discriminated union of progress lifecycle events (`SpeakerInitiateProgress`, `SpeakerDownloadProgress`, `SpeakerChunkProgress`, `SpeakerDoneProgress`, `SpeakerReadyProgress`).
* **`SpeakerProgressStatus`**: `"initiate" | "download" | "progress" | "done" | "ready"`.
* **`SpeakerProgressCallback`**: `(progress: SpeakerProgress) => void`.
* **`StorageInfo`**: Offline cache inspection metrics (`isCached`, `modelSizeBytes`, `modelSizeFormatted`, `totalUsageBytes`, `totalUsageFormatted`, `persisted`).

---

## Low-Level Phonology & Audio Utilities

You can also import individual building blocks:

```typescript
import {
  koreanToIpa,
  koreanToPronunciation,
  decomposeHangul,
  composeHangul,
  numberToNativeKorean,
  createWavBlob,
  Visualizer,
} from "korean-kokoro";

// 1. Phonetic Hangul pronunciation according to Standard Korean rules (표준 발음법)
const pron = koreanToPronunciation("국밥"); // -> "국빱"
const thankYou = koreanToPronunciation("감사합니다"); // -> "감사함니다"
const liaison = koreanToPronunciation("한국어"); // -> "한구거"

// 2. Phonetic Hangul-to-IPA transcription with assimilation rules
const ipa = koreanToIpa("감사합니다"); // -> "kamsahamnita"

// 3. Native Korean number conversion (순우리말 수사)
const count = numberToNativeKorean(20, true); // -> "스무" (e.g. "스무 살")

// 4. Convert raw Float32Array PCM samples to WAV Blob
const wavBlob = createWavBlob(float32Array, 24000);
```

---

## Unit Testing & Phonology Rules Suite

The repository includes a comprehensive unit test suite covering Standard Korean Phonology rules (표준 발음법):
- **Palatalization (구개음화)**: `굳이` → `[구지]`, `같이` → `[가치]`, `닫히다` → `[다치다]`
- **Aspiration (격음화)**: `축하` → `[추카]`, `좋다` → `[조타]`, `맞히다` → `[마치다]`, `밝히다` → `[발키다]`
- **Liaison & ㅎ-Elision (연음 & ㅎ 탈락)**: `한국어` → `[한구거]`, `좋아` → `[조아]`, `값이` → `[갑씨]`
- **Nasalization (비음화)**: `국물` → `[궁물]`, `감사합니다` → `[감사함니다]`, `있는` → `[인는]`
- **Liquid Nasalization (ㄹ의 비음화)**: `국립` → `[궁닙]`, `독립` → `[동닙]`, `대통령` → `[대통녕]`, `협력` → `[혐녁]`
- **Lateralization (유음화)**: `신라` → `[실라]`, `난로` → `[날로]`, `설날` → `[설랄]`, `물난리` → `[물랄리]`
- **Tensification / Glottalization (경음화)**: `국밥` → `[국빱]`, `학교` → `[학꾜]`, `있다` → `[읻따]`, `맑게` → `[말께]`
- **Coda Neutralization (자음군 단순화 & 음절 끝소리)**: `닭` → `[닥]`, `값` → `[갑]`, `삶` → `[삼]`, `여덟` → `[여덜]`
- **Native Korean Counting Units & Normalization**: `1개` → `한 개`, `2명` → `두 명`, `20살` → `스무 살`, `24,500원` → `이만 사천오백원`

Run the test suite:
```bash
npm run test
# or directly with Node:
node --experimental-strip-types --test test/**/*.test.ts
```

---

## Running the Interactive Demo Playground

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests
npm run test

# 3. Start dev server
npm run dev
# Open http://localhost:5173

# 4. Build library package (ESM + CJS + .d.ts)
npm run build:lib

# 5. Build demo web app
npm run build:demo
```

---

## License

This project is licensed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
