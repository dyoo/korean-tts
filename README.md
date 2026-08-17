# Korean Kokoro TTS — Phonology Engine & WASM Playground

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue?style=flat-square&logo=github)](https://dyoo.github.io/korean-tts/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

A lightweight, zero-backend WebAssembly (WASM) and WebGPU speech synthesis engine and testing playground for running [**Kokoro-82M TTS**](https://huggingface.co/hexgrad/Kokoro-82M) on Korean sentences.

🎮 **Live Interactive Demo:** [https://dyoo.github.io/korean-tts/](https://dyoo.github.io/korean-tts/)

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

## Korean G2P & IPA Algorithm Architecture

The speech synthesis pipeline converts raw Korean text into phonetically transcribed, Kokoro-compatible IPA monophthongs through a 4-stage pipeline:

```
┌─────────────────────────┐
│     Raw Korean Text     │  "국밥 2개 주세요! 50% 할인되나요?"
└────────────┬────────────┘
             │ 1. Normalization & Tokenization
┌────────────▼────────────┐
│   Normalized Hangul     │  "국밥 두 개 주세요! 오십 퍼센트 할인되나요?"
└────────────┬────────────┘
             │ 2. Unicode Jamo Decomposition (초성 / 중성 / 종성)
┌────────────▼────────────┐
│   Decomposed Syllables  │  [{ᄀ, ᅮ, ᆨ}, {ᄇ, ᅡ, ᆸ}, ...]
└────────────┬────────────┘
             │ 3. Multi-Pass Phonology Engine (표준 발음법)
┌────────────▼────────────┐
│ Phonetic Hangul Pron.   │  "국빱 두 개 주세요! 오십 퍼센트 할인되나요?"
└────────────┬────────────┘
             │ 4. Allophonic Kokoro IPA Transcription
┌────────────▼────────────┐
│       Output IPA        │  "kuk̚p͈ap̚ tu ɡe ʨusejo! oɕip̚ pʰʌsɛntʰɯ haɾindwenajo?"
└─────────────────────────┘
```

---

### Stage 1: Text & Number Normalization (`normalizeKoreanText`)

Raw inputs often contain digits, currency, dates, percentages, and acronyms that must be converted to spoken Korean words before phonetic transcription:

1. **Native Korean Counting Units (순우리말 수사)**:
   - Matches numbers `1–99` before counting classifiers (`개`, `명`, `살`, `마리`, `잔`, `권`, `장`, `번`, etc.) and transforms them into pure Korean attributive forms:
     - `1개` → `한 개`, `2명` → `두 명`, `3살` → `세 살`, `4마리` → `네 마리`, `20살` → `스무 살`, `21명` → `스물한 명`.
2. **Clock Times & Hours**:
   - Hours use Native Korean, while minutes and seconds use Sino-Korean: `3시 30분` → `세시 삼십분`, `12시 5분` → `열두시 오분`.
3. **Decimals, Percentages & Phone Numbers**:
   - Decimals: `3.14` → `삼 점 일사`, `0.5` → `영 점 오`
   - Percentages: `99.9%` → `구십구 점 구 퍼센트`
   - Phone numbers: `010-1234-5678` → `공일공 일이삼사 오육칠팔`
   - Ordinals: `1번째` → `첫 번째`, `2번째` → `두 번째`, `3번째` → `세 번째`
4. **Sino-Korean Currency & Dates**:
   - `24,500원` → `이만 사천오백원`, `2026년 8월 15일` → `이천이십육년 팔월 십오일`.
5. **English Acronyms & Letters**:
   - `AI 모델` → `에이아이 모델`, `TTS` → `티티에스`, `OK` → `오케이`.
6. **Standalone Jamo Normalization (단독 자모 발음)**:
   - **Standalone Vowels**: Mapped to canonical zero-onset syllables (`ㅗ` → `오` [o], `ㅏ` → `아` [a], `ㅜ` → `우` [u], `ㅣ` → `이` [i], `ㅐ` → `애` [ɛ]).
   - **Standalone Consonants**: Vocalized with phonetic base vowel `ㅡ` (`ㄱ` → `그` [kɯ], `ㄴ` → `느` [nɯ], `ㄷ` → `드` [tɯ], `ㅅ` → `스` [sɯ], `ㅋ` → `크` [kʰɯ], `ㄲ` → `끄` [k͈ɯ], `ㅇ` → `응` [ɯŋ]).

---

### Stage 2: Syllabic Jamo Decomposition (`decomposeHangul`)

Hangul syllables in the Unicode range `0xAC00`–`0xD7A3` (and standalone compatibility Jamos `0x3131`–`0x318E` / `0x1100`–`0x11FF`) are decomposed arithmetically into their 19 Initial Consonants (초성), 21 Vowels (중성), and 28 Final Codas (종성):

$$\text{offset} = \text{charCode} - \text{0xAC00}$$
$$\text{choIdx} = \lfloor \text{offset} / 588 \rfloor, \quad \text{jungIdx} = \lfloor (\text{offset} / 28) \bmod 21 \rfloor, \quad \text{jongIdx} = \text{offset} \bmod 28$$

---

### Stage 3: Multi-Pass Phonological Transformation (`applyPhonologicalRules`)

Applies the official [Standard Korean Pronunciation Rules (국립국어원 표준 발음법)](https://ko.wikisource.org/wiki/%ED%91%9C%EC%A4%80%EC%96%B4_%EA%B7%9C%EC%A0%95#%EC%A0%9C2%EB%B6%80_%ED%91%9C%EC%A4%80_%EB%B0%9C%EC%9D%8C%EB%B2%95) across syllable boundaries:

1. **Palatalization (구개음화 — 제17항)**:
   - `ㄷ, ㅌ, ㄾ` before `ㅣ` or `j`-glides become `ㅈ, ㅊ`:
   - `굳이` → `[구지]`, `같이` → `[가치]`, `핥이다` → `[할치다]`, `닫히다` → `[다치다]`.
2. **Aspiration & ㅎ-Elision (격음화 및 ㅎ 탈락 — 제12항)**:
   - Obstruent + `ㅎ` or `ㅎ` + obstruent fuse into aspirated consonants (`ㅋ, ㅌ, ㅍ, ㅊ`): `축하` → `[추카]`, `좋다` → `[조타]`, `맞히다` → `[마치다]`.
   - `ㅎ` between vowels/sonorants drops: `좋아` → `[조아]`, `많이` → `[마니]`, `싫어` → `[시러]`.
3. **Liaison (연음법칙 — 제13항, 제14항)**:
   - Single and compound codas move to empty onset (`ㅇ`) of the following syllable: `한국어` → `[한구거]`, `값이` → `[갑씨]`, `닭을` → `[달글]`, `삶이` → `[살미]`.
4. **Liquid Lateralization & Nasalization (유음화 및 ㄹ의 비음화 — 제19항, 제20항)**:
   - `ㄴ + ㄹ` and `ㄹ + ㄴ` become lateral geminate `ㄹㄹ`: `신라` → `[실라]`, `난로` → `[날로]`, `설날` → `[설랄]`.
   - `ㅁ, ㅇ` + `ㄹ` → `ㅁ, ㅇ + ㄴ`: `종로` → `[종노]`, `대통령` → `[대통녕]`, `침략` → `[침냑]`.
   - `ㄱ, ㅂ` + `ㄹ` → `ㅇ, ㅁ + ㄴ` (Mutual assimilation): `국립` → `[궁닙]`, `독립` → `[동닙]`, `협력` → `[혐녁]`.
5. **Nasalization (비음화 — 제18항)**:
   - Stops (`ㄱ, ㄷ, ㅂ`) before nasals (`ㄴ, ㅁ`) become nasals (`ㅇ, ㄴ, ㅁ`): `국물` → `[궁물]`, `감사합니다` → `[감사함니다]`, `있는` → `[인는]`.
6. **Tensification / Glottalization (경음화 / 된소리되기 — 제23항~제26항)**:
   - **Post-Obstruent (제23항)**: `국밥` → `[국빱]`, `학교` → `[학꾜]`, `있다` → `[읻따]`, `잡지` → `[잡찌]`.
   - **Special `ㄺ + ㄱ` (제25항)**: `맑게` → `[말께]`, `읽고` → `[일꼬]`.
   - **Predicate Stems ending in `ㄴ, ㅁ` (제24항)**: `신다` → `[신따]`, `앉다` → `[안따]`, `젊다` → `[점따]`, `삼다` → `[삼따]`.
   - **Sino-Korean `ㄹ` Coda (제26항)**: Hanja roots ending in `ㄹ` tensify subsequent `ㄷ, ㅅ, ㅈ`: `갈등` → `[갈뜽]`, `발전` → `[발쩐]`, `물질` → `[물찔]`, `실수` → `[실쑤]`, `활동` → `[활똥]`, `열정` → `[열쩡]`.
7. **Coda Neutralization (자음군 단순화 & 음절 끝소리 규칙 — 제8항~제11항)**:
   - Final codas in isolation or before consonants reduce to the 7 stop archetypes (`ㄱ, ㄴ, ㄷ, ㄹ, ㅁ, ㅂ, ㅇ`): `닭` → `[닥]`, `값` → `[갑]`, `삶` → `[삼]`, `여덟` → `[여덜]`, `꽃` → `[꼳]`.

---

### Stage 4: Allophonic Kokoro-Targeted IPA Transcription (`convertKoreanToSpeechText`)

Converts the assimilated syllable tokens into accurate International Phonetic Alphabet (IPA) representations optimized for Kokoro-82M CJK acoustic models:

1. **Alveolo-palatalization (`[ɕ, ɕ͈]`)**:
   - `ㅅ, ㅆ` preceding `/i/` or `/j/` glides are transcribed as alveolo-palatal `[ɕ, ɕ͈]`:
     - `시간` → `ɕiɡan` (instead of `sikan`)
     - `신라` → `ɕilla`
     - `시작` → `ɕiʥak̚`
     - `씨앗` → `ɕ͈iat̚`
2. **Intervocalic & Post-Sonorant Voicing (`[ɡ, d, b, ʥ]`)**:
   - Plain stops and affricates (`ㄱ, ㄷ, ㅂ, ㅈ`) become voiced between sonorants (vowels and `ㄴ, ㄹ, ㅁ, ㅇ`):
     - `아버지` → `abʌʥi`
     - `친구` → `ʨʰinɡu`
     - `한국어` → `hanɡuɡʌ`
     - `감사합니다` → `kamsahamnida`
3. **Lateral Gemination (`[ll]`)**:
   - Consecutive `ㄹ` sounds are represented as true alveolar lateral geminates (`[ll]`):
     - `설날` → `sʌllal`
     - `빨리` → `p͈alli`
4. **Unreleased Stop Codas (`[k̚, t̚, p̚]`)**:
   - Syllable-final stops are marked as unreleased: `국밥` → `kuk̚p͈ap̚`.
5. **Vowel Hiatus & Zero-Onset Boundaries (`[ˌ]`)**:
   - Open syllables ending in a vowel followed by a zero-onset syllable (`ㅇ`) receive a secondary stress syllable foot marker `ˌ` (Token ID 161) to create a crisp, micro-beat syllable transition while preventing diphthong collapse:
     - `내일` → `nɛˌil`
     - `오이` → `oˌi`
     - `아이` → `aˌi`
     - `좋은` → `ʨoˌɯn`

---

## [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) 115-Token Phoneme Architecture & IPA Compatibility

[**Kokoro-82M**](https://huggingface.co/hexgrad/Kokoro-82M) is a neural Text-to-Speech model with an internal 115-token phoneme vocabulary (comprising ASCII letters, selected IPA extensions, punctuation, and Japanese/Chinese phonetic tokens). Unlike standard NLP tokenizers with thousands of subwords, Kokoro processes text strictly at the phoneme level.

Characters not present in Kokoro's 115-token vocabulary are **silently dropped by the tokenizer**. Understanding this mapping is essential for natural Korean synthesis.

### Complete 115-Token Vocabulary Breakdown

Kokoro's vocabulary consists of 115 valid tokens indexed across ID 0 to 177:

| Category | Tokens | Count | Description |
| :--- | :--- | :--- | :--- |
| **Punctuation & Prosody** | `$`, `;`, `:`, `,`, `.`, `!`, `?`, `—`, `…`, `"`, `(`, `)`, `“`, `”`, ` ` (space) | 15 | Sentence boundaries, pauses, and dialogue quotes |
| **ASCII Alphabet (Lower)** | `a`, `b`, `c`, `d`, `e`, `f`, `h`, `i`, `j`, `k`, `l`, `m`, `n`, `o`, `p`, `q`, `r`, `s`, `t`, `u`, `v`, `w`, `x`, `y`, `z` | 25 | Standard Latin phonemes (`g` is replaced by IPA `ɡ`) |
| **ASCII Alphabet (Upper)** | `A`, `I`, `O`, `Q`, `S`, `T`, `W`, `Y` | 8 | Special prosodic & language tokens (`Q` = Japanese sokuon ッ) |
| **Affricates & Ligatures** | `ʥ` (19), `ʨ` (21), `ʦ` (20), `ʣ` (18), `ʧ` (133), `ʤ` (82), `ꭧ` (23) | 7 | Dedicated alveolo-palatal, dental, and post-alveolar affricates |
| **Vowels (IPA Extensions)** | `ɑ`, `ɐ`, `ɒ`, `æ`, `ɔ`, `ə`, `ɚ`, `ɛ`, `ɜ`, `ɨ`, `ɪ`, `ɯ`, `ø`, `œ`, `ʊ`, `ʌ`, `ɤ`, `ᵻ` | 18 | Monophthongs, central vowels, and open/close variants |
| **Consonants (IPA Extensions)** | `ɕ`, `ç`, `ɖ`, `ð`, `ɟ`, `ɡ`, `ɥ`, `ʝ`, `ɰ`, `ŋ`, `ɳ`, `ɲ`, `ɴ`, `ɸ`, `θ`, `ɹ`, `ɾ`, `ɻ`, `ʁ`, `ɽ`, `ʂ`, `ʃ`, `ʈ`, `ʋ`, `ɣ`, `χ`, `ʎ`, `ʒ`, `ʔ` | 29 | Fricatives, nasals, retroflex, liquids, glottal stop |
| **Diacritics & Modifiers** | `̃` (nasalization), `ᵝ`, `ᵊ`, `ˈ` (primary stress), `ˌ` (secondary stress), `ː` (length), `ʰ` (aspiration), `ʲ` (palatalization) | 8 | Phoneme modifiers |
| **Tonal Contours** | `↓` (downstep / 3rd tone), `→` (level / 1st tone), `↗` (rising / 2nd tone), `↘` (falling / 4th tone) | 4 | Asian tonal pitch inflections |

---

### Korean Hangul to Kokoro IPA Phoneme Mapping

| Korean Grapheme | Standard Linguistic IPA | Kokoro Token(s) | Status in Vocab | Notes & Acoustic Treatment |
| :--- | :--- | :--- | :--- | :--- |
| **ㄱ (Initial)** | `[k]` | `k` | Native (ID 53) | Voiceless velar stop |
| **ㄱ (Voiced Intervocalic)** | `[ɡ]` | `ɡ` | Native (ID 92) | Voiced velar stop between vowels/sonorants |
| **ㄲ (Tense)** | `[k͈]` | `k` / `k͈` | Diacritic dropped | `\u0348` stripped by tokenizer; synthesized as unvoiced stop |
| **ㅋ (Aspirated)** | `[kʰ]` | `kʰ` | Native (`k` + `ʰ`) | Aspirated velar stop (IDs 53 + 162) |
| **ㄷ (Initial)** | `[t]` | `t` | Native (ID 62) | Voiceless alveolar stop |
| **ㄷ (Voiced Intervocalic)** | `[d]` | `d` | Native (ID 46) | Voiced alveolar stop |
| **ㄸ (Tense)** | `[t͈]` | `t` / `t͈` | Diacritic dropped | `\u0348` stripped by tokenizer |
| **ㅌ (Aspirated)** | `[tʰ]` | `tʰ` | Native (`t` + `ʰ`) | Aspirated alveolar stop (IDs 62 + 162) |
| **ㅂ (Initial)** | `[p]` | `p` | Native (ID 58) | Voiceless bilabial stop |
| **ㅂ (Voiced Intervocalic)** | `[b]` | `b` | Native (ID 44) | Voiced bilabial stop |
| **ㅃ (Tense)** | `[p͈]` | `p` / `p͈` | Diacritic dropped | `\u0348` stripped by tokenizer |
| **ㅍ (Aspirated)** | `[pʰ]` | `pʰ` | Native (`p` + `ʰ`) | Aspirated bilabial stop (IDs 58 + 162) |
| **ㅈ (Initial / Plain)** | `[t͡ɕ]` | `ʨ` | Native (ID 21) | Mapped to Kokoro's native voiceless alveolo-palatal affricate |
| **ㅈ (Voiced Intervocalic)** | `[d͡ʑ]` | `ʥ` | Native (ID 19) | Mapped to Kokoro's native voiced alveolo-palatal affricate |
| **ㅉ (Tense)** | `[t͡ɕ͈]` | `ʨ͈` $\rightarrow$ `ʨ` | Diacritic dropped | `\u0348` stripped by tokenizer |
| **ㅊ (Aspirated)** | `[t͡ɕʰ]` | `ʨʰ` | Native (`ʨ` + `ʰ`) | Single affricate + aspiration modifier (IDs 21 + 162) |
| **ㅅ (Plain)** | `[s]` | `s` | Native (ID 61) | Alveolar fricative before /a, ʌ, o, u, ɯ/ |
| **ㅅ (Palatalized /i, j/)** | `[ɕ]` | `ɕ` | Native (ID 77) | Alveolo-palatal fricative before /i, j/ (e.g. `시간` → `ɕiɡan`) |
| **ㅆ (Tense)** | `[s͈]` | `s` / `s͈` | Diacritic dropped | `\u0348` stripped by tokenizer |
| **ㅆ (Palatalized /i, j/)** | `[ɕ͈]` | `ɕ` / `ɕ͈` | Diacritic dropped | `\u0348` stripped by tokenizer |
| **ㅎ (Glottal)** | `[h]` | `h` | Native (ID 50) | Voiceless glottal fricative |
| **ㄴ (Alveolar Nasal)** | `[n]` | `n` | Native (ID 56) | Alveolar nasal |
| **ㅁ (Bilabial Nasal)** | `[m]` | `m` | Native (ID 55) | Bilabial nasal |
| **ㅇ (Velar Nasal Coda)** | `[ŋ]` | `ŋ` | Native (ID 112) | Velar nasal coda (e.g. `강` → `kaŋ`) |
| **ㄹ (Flap Onset)** | `[ɾ]` | `ɾ` | Native (ID 125) | Alveolar tap/flap (e.g. `바람` → `paɾam`) |
| **ㄹ (Lateral Coda/Geminate)** | `[l]` / `[ll]` | `l` / `ll` | Native (ID 54) | Alveolar lateral (e.g. `신라` → `ɕilla`) |
| **Unreleased Codas (ㄱ, ㄷ, ㅂ)** | `[k̚, t̚, p̚]` | `k, t, p` | Diacritic dropped | `\u031a` stripped by tokenizer; natural coda acoustic decay |
| **ㅏ, ㅓ, ㅗ, ㅜ, ㅡ, ㅣ** | `[a, ʌ, o, u, ɯ, i]` | `a, ʌ, o, u, ɯ, i` | All Native | Exact 1:1 monophthong tokens in Kokoro |
| **ㅐ, ㅔ** | `[ɛ], [e]` | `ɛ, e` | All Native | `ɛ` (ID 86) and `e` (ID 47) both supported |
| **ㅚ, ㅟ, ㅢ** | `[we], [ɥi], [ɰi]` | `we, ɥi, ɰi` | All Native | `ɰ` (ID 111) and `ɥ` (ID 99) natively supported |
| **Glides (ㅑ, ㅕ, ㅛ, ㅠ, ㅘ, ㅝ, ...)** | `[ja, jʌ, jo, ju, wa, wʌ]` | `ja, jʌ, jo, ju, wa, wʌ` | All Native | Combined glide + vowel sequences |

---

### Key Phonetic Gaps & Solutions

#### 1. The Intervocalic Affricate Gap (`d͡ʑ` $\rightarrow$ `d` Regression)
* **The Problem**: In standard linguistic literature, the voiced intervocalic allophone of `ㅈ` is written as `[d͡ʑ]`. However, neither the tie bar `\u0361` (`͡`) nor the curly-tail z `\u0291` (`ʑ`) exists in Kokoro's 115-token vocabulary. When `d͡ʑ` was passed to the tokenizer, it silently stripped `͡` and `ʑ`, leaving only `d` (alveolar plosive /d/).
* **Result**:
  - `휴지` (hyu-ji) became `['h', 'j', 'u', 'd', 'i']` $\rightarrow$ synthesized as **"휴디" (hyudi)**.
  - `타조` (ta-jo) became `['t', 'ʰ', 'a', 'd', 'o']` $\rightarrow$ synthesized as **"타도" (tado)**.
  - `된장` (doen-jang) became `['t', 'w', 'e', 'n', 'd', 'a', 'ŋ']` $\rightarrow$ synthesized as **"된당" (doendang)**.
  - `아버지` (a-beo-ji) became `['a', 'b', 'ʌ', 'd', 'i']` $\rightarrow$ synthesized as **"아버디" (abeodi)**.
* **The Solution**: Kokoro contains the dedicated CJK voiced alveolo-palatal affricate token **`ʥ` (Token 19)** (the same token used by Misaki for Japanese `ジ` and voiced affricates). Mapping voiced `ㅈ` to `ʥ` produces natural affricate voicing: `hjuʥi`, `tʰaʥo`, `twenʥaŋ`, `abʌʥi`.

#### 2. The Aspirated Affricate Splitting Gap (`t͡ɕʰ` $\rightarrow$ `t ɕ ʰ`)
* **The Problem**: `ㅊ` transcribed as `[t͡ɕʰ]` lost its tie bar in tokenization and split into three separate tokens: `t` (plosive) + `ɕ` (fricative) + `ʰ` (aspiration).
* **Result**: The acoustic model generated an unnatural pause/drag across three separate phonemes (1.85s vs 1.38s for `초코`), sounding disjointed.
* **The Solution**: Mapping `ㅊ` to **`ʨʰ` (Tokens 21 + 162)** leverages Kokoro's native voiceless alveolo-palatal affricate `ʨ` with aspiration `ʰ`, producing crisp, rapid articulation.

#### 3. Tension / Glottalization Diacritic Gap (`\u0348` / `͈`)
* **The Problem**: The IPA tension mark `\u0348` (`͈`) is not in Kokoro's vocabulary.
* **Acoustic Behavior**: When `k͈a` (까) or `s͈a` (싸) is passed, the tokenizer strips `͈` and feeds `k` / `s`. In Kokoro, Asian voice models (e.g. `zf_xiaobei`, `jf_nezumi`) naturally articulate unvoiced initial stops `k`, `t`, `p` with high vocal tract tension compared to intervocalic voiced stops `ɡ`, `d`, `b`, `ʥ`.

#### 4. Unreleased Coda Diacritic Gap (`\u031a` / `̚`)
* **The Problem**: The IPA unreleased stop mark `\u031a` (`̚` as in `k̚, t̚, p̚`) is not in Kokoro's vocabulary.
* **Acoustic Behavior**: The tokenizer strips `̚` and tokens become `k`, `t`, `p`. Because these tokens reside in syllable coda position before a boundary or subsequent onset, Kokoro's acoustic model naturally decays them without release bursts.

#### 5. Vowel Hiatus & Zero-Onset Syllable Transition (`내일`, `아이`, `오이`)
* **The Problem**: When a vowel-final syllable is followed by an `ㅇ`-onset syllable (e.g. `내일` $\rightarrow$ `내` + `일` $\rightarrow$ `nɛil`), direct concatenation of `ɛ` + `i` without boundary markers causes multilingual acoustic models to fuse the adjacent vowels into a single English-like diphthong (e.g. pronouncing `내일` as the 1-syllable English word "nail" /neɪl/). Full punctuation marks like `.` introduce an unnaturally long sentence-level pause (~250ms).
* **The Solution**: The engine automatically detects vowel hiatus across zero-onset boundaries (`prev.jongIdx === 0 && s.choIdx === 11`) and inserts a secondary stress syllable foot marker `ˌ` (Token ID 161 / `\u02CC`). This creates a crisp, natural 2-syllable beat without dead silence:
  - `내일` → `nɛˌil` (0.82s vs 2.08s with `.`)
  - `오이` → `oˌi`
  - `아이` → `aˌi`
  - `좋은` → `ʨoˌɯn`

---

## Unit Testing & Verification

The engine is covered by **227 automated unit tests** across 22 suites:

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

## References & Standards

- **[Kokoro-82M (hexgrad / Hugging Face)](https://huggingface.co/hexgrad/Kokoro-82M)**: Open-weight 82M parameter multi-lingual neural TTS model.
- **[Kokoro-82M-v1.0-ONNX (onnx-community)](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)**: WebAssembly / WebGPU ONNX weights for in-browser client-side inference.
- **[국립국어원 표준어 규정 — 제2부 표준 발음법 (Wikisource Full Text)](https://ko.wikisource.org/wiki/%ED%91%9C%EC%A4%80%EC%96%B4_%EA%B7%9C%EC%A0%95#%EC%A0%9C2%EB%B6%80_%ED%91%9C%EC%A4%80_%EB%B0%9C%EC%9D%8C%EB%B2%95)**: Complete official statutory text of the Standard Korean Pronunciation Rules (Articles 1–30, covering liaison, palatalization, aspiration, nasalization, liquid assimilation, tensification, and coda reduction).
- **[National Institute of Korean Language Portal (국립국어원 한국어 어문 규범)](https://kornorms.korean.go.kr/regltn/regltnView.do?regltn_code=0002)**: Official NIKL regulations and commentary.
- **[Wikipedia: Korean Phonology](https://en.wikipedia.org/wiki/Korean_phonology)**: Comprehensive linguistic overview of the sound system of modern Korean.

---

## Development & Attribution

This project and its Korean phonology G2P engine were designed and pair-programmed by **Danny Yoo** in collaboration with **Antigravity** (Google DeepMind).

---

## License

This project is licensed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
