# Kokoro TTS WebAssembly — Korean Speech Quality Tester

A lightweight, zero-backend WebAssembly (WASM) and WebGPU speech synthesis playground to evaluate and benchmark **Kokoro-82M TTS** on short Korean sentences.

The repository is **under 100 KB**; all neural network model weights and voice embeddings are fetched **on-demand** from the Hugging Face CDN upon first interaction and stored in the browser's persistent `CacheStorage` for zero-latency subsequent runs.

---

## Model Provenance & On-Demand Architecture

The application operates without a backend server, streaming open-source neural network assets directly into the browser:

### 1. Neural Network Model Weights (`Kokoro-82M`)
* **Upstream Model**: [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by `@hexgrad`
* **ONNX Conversion & Quantization**: [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
* **Architecture**: StyleTTS2-based lightweight Text-to-Speech model with 82 million parameters.
* **Quantization**: 8-bit quantized ONNX (`model_quantized.onnx`, ~88 MB) downloaded on-demand and cached via `CacheStorage`.
* **License**: **Apache 2.0**

### 2. Speaker Voice Style Embeddings (Asian / CJK Syllable-Timed)
* **Source**: [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/voices) and `hexgrad/Kokoro-82M`.
* **On-Demand Loading**: Individual ~130 KB style vectors are fetched on-demand only when a specific voice is synthesized, then cached in memory/browser cache.
* **Optimized Voices for Korean**:
  * **Japanese Voices**: `jf_alpha` (Female / JP), `jf_gongitsune` (Female / JP), `jf_nezumi` (Female / JP), `jf_tebukuro` (Female / JP), `jm_kumo` (Male / JP).
  * **Mandarin Voices**: `zf_xiaobei` (Female / ZH), `zf_xiaoni` (Female / ZH), `zf_xiaoxiao` (Female / ZH), `zf_xiaoyi` (Female / ZH), `zm_yunxi` (Male / ZH), `zm_yunjian` (Male / ZH), `zm_yunxia` (Male / ZH), `zm_yunyang` (Male / ZH).
* **License**: **Apache 2.0**

### 3. WebAssembly & Neural Engine Runtime (`ort-wasm-simd-threaded.jsep.wasm`)
* **Source**: [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (`onnxruntime-web`) via `@huggingface/transformers`.
* **Execution Capabilities**: Multi-threaded SIMD WebAssembly (ARM NEON / x86 AVX) and WebGPU JSEP (JavaScript Execution Provider) hardware acceleration.
* **License**: **MIT License**

---

## Korean Grapheme & IPA Phonology Engine

Because Kokoro-82M's tokenizer is built for phonetic alphabets, [`src/korean-engine.js`](src/korean-engine.js) translates Korean Hangul text into pure **International Phonetic Alphabet (IPA)** payloads to prevent English vowel gliding (diphthongization) and ensure flat, natural Korean syllable pacing:

- **Syllable Decomposition**: Breaks syllables into 초성 (19 consonants), 중성 (21 vowels), and 종성/받침 (28 codas).
- **Phonological Assimilation Rules**:
  - **Liaison (연음법칙)**: e.g. `한국어` $\rightarrow$ `[한구거]`, `음악` $\rightarrow$ `[으막]`.
  - **Nasalization (비음화)**: e.g. `감사합니다` $\rightarrow$ `[감사함니다]`, `국물` $\rightarrow$ `[궁물]`.
  - **Lateralization (유음화)**: e.g. `신라` $\rightarrow$ `[실라]`, `연락` $\rightarrow$ `[열락]`.
  - **Aspiration (격음화)**: e.g. `축하` $\rightarrow$ `[추카]`, `좋다` $\rightarrow$ `[조타]`.
  - **Palatalization (구개음화)**: e.g. `같이` $\rightarrow$ `[가치]`, `굳이` $\rightarrow$ `[구지]`.
- **Number & Time Normalizer**: Automatically expands Sino-Korean & Native Korean numbers (e.g. `2026년 8월 15일 오후 3시 30분` $\rightarrow$ `이천이십육년 팔월 십오일 오후 세시 삼십분`, `24,500원` $\rightarrow$ `이만사천오백원`).

---

## Quick Start

```bash
# 1. Install dependencies (< 10 seconds)
npm install

# 2. Start the local development server
npm run dev

# 3. Open in browser
# Navigate to http://localhost:5173
```

To build for production or static hosting:
```bash
npm run build
npm run preview
```
