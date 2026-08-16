# Korean Kokoro TTS — Phonology Engine & WASM Playground

A lightweight, zero-backend WebAssembly (WASM) and WebGPU speech synthesis engine and testing playground for running **Kokoro-82M TTS** on Korean sentences.

This package can be used as an **npm library** in your own web applications/PWAs, or run locally as an **interactive playground**.

---

## Library Usage (npm)

### 1. Installation

```bash
npm install korean-kokoro kokoro-js
```

### 2. High-Level `KoreanSpeaker` API

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

// 4. Synthesize speech from Korean text
const result = await speaker.synthesize("안녕하세요! 반갑습니다.", {
  voice: "zf_xiaobei",
  speed: 1.0,
});

// Access metrics & outputs
console.log(`Generated in ${result.genTimeMs}ms (${result.rtf.toFixed(2)}x RTF)`);
console.log(`IPA Payload: ${result.ipa}`);

// 5. Playback or download WAV
const wavBlob = result.toWavBlob();
const audioUrl = result.toAudioUrl();

// 6. Direct one-line speak & play
await speaker.speak("오늘도 좋은 하루 되세요!");

// 7. Inspect or clear offline storage (PWA ready)
const storage = await speaker.getStorageInfo();
console.log(`Storage: ${storage.modelSizeFormatted} (Offline Cached: ${storage.isCached})`);

// Delete cached model from disk and release RAM when user opts out
// await speaker.clearStorage();
```

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
