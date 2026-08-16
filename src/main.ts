import { KokoroTTS } from "kokoro-js";
import { Tensor, RawAudio, env } from "@huggingface/transformers";
import {
  KOREAN_SENTENCE_PRESETS,
  KOKORO_VOICES,
  convertKoreanToSpeechText,
  type SentenceItem,
  type VoiceConfig,
} from "./korean-engine";
import { createWavBlob, Visualizer } from "./audio-utils";

// Configure Transformers.js for lightweight on-demand remote CDN loading with browser cache
env.allowLocalModels = false;
env.allowRemoteModels = true;

// Type Definitions
export interface TestRecord {
  id: number;
  korean: string;
  payload: string;
  voice: string;
  speed: number;
  genTimeMs: number;
  durationSec: number;
  sampleRate: number;
  rtf: number;
  wavBlob?: Blob;
  ratings?: {
    naturalness: number;
    pronunciation: number;
    intonation: number;
    clarity: number;
  };
  averageScore?: string;
  notes?: string;
  timestamp?: string;
}

export interface ProgressInfo {
  status: string;
  progress?: number;
  file?: string;
}

// State
let ttsInstance: KokoroTTS | null = null;
let isModelLoading: boolean = false;
let currentAudioBuffer: Float32Array | null = null;
let currentWavBlob: Blob | null = null;
let currentAudioDuration: number = 0;
let currentRunMetadata: TestRecord | null = null;

const voiceCache = new Map<string, Float32Array>();

let activeAudioSource: AudioBufferSourceNode | null = null;
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let isPlaying: boolean = false;
let playStartTime: number = 0;
let pauseOffset: number = 0;
let playbackTimer: number | null = null;

let activeCategoryIdx: number = 0;
let selectedPresetId: string | null = "g1";
let isManualPhonemeEditing: boolean = false;

// Ratings State
const currentRatings = {
  naturalness: 0,
  pronunciation: 0,
  intonation: 0,
  clarity: 0,
};

// Test History Log
const testHistory: TestRecord[] = [];

// DOM Elements
const loadModelBtn = document.getElementById("loadModelBtn") as HTMLButtonElement;
const statusDot = document.getElementById("statusDot") as HTMLSpanElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const progressBarContainer = document.getElementById("progressBarContainer") as HTMLDivElement;
const progressBarFill = document.getElementById("progressBarFill") as HTMLDivElement;
const progressLabel = document.getElementById("progressLabel") as HTMLSpanElement;
const progressPercentage = document.getElementById("progressPercentage") as HTMLSpanElement;

const categoryTabs = document.getElementById("categoryTabs") as HTMLDivElement;
const presetList = document.getElementById("presetList") as HTMLDivElement;
const koreanInput = document.getElementById("koreanInput") as HTMLTextAreaElement;
const charCount = document.getElementById("charCount") as HTMLDivElement;
const phoneticPreviewText = document.getElementById("phoneticPreviewText") as HTMLDivElement;
const manualPhonemeInput = document.getElementById("manualPhonemeInput") as HTMLTextAreaElement;
const toggleManualPhonemeBtn = document.getElementById("toggleManualPhonemeBtn") as HTMLButtonElement;

const voiceSelect = document.getElementById("voiceSelect") as HTMLSelectElement;
const voiceDesc = document.getElementById("voiceDesc") as HTMLDivElement;
const speedRange = document.getElementById("speedRange") as HTMLInputElement;
const speedVal = document.getElementById("speedVal") as HTMLSpanElement;
const deviceSelect = document.getElementById("deviceSelect") as HTMLSelectElement;
const generateBtn = document.getElementById("generateBtn") as HTMLButtonElement;
const genBtnText = document.getElementById("genBtnText") as HTMLSpanElement;
const genSpinner = document.getElementById("genSpinner") as HTMLSpanElement;
const genIcon = document.getElementById("genIcon") as unknown as SVGElement;

const audioMetrics = document.getElementById("audioMetrics") as HTMLDivElement;
const metricGenTime = document.getElementById("metricGenTime") as HTMLSpanElement;
const metricDuration = document.getElementById("metricDuration") as HTMLSpanElement;
const metricRtf = document.getElementById("metricRtf") as HTMLSpanElement;

const waveformCanvas = document.getElementById("waveformCanvas") as HTMLCanvasElement;
const visualizerOverlay = document.getElementById("visualizerEmpty") as HTMLDivElement;
const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
const seekSlider = document.getElementById("seekSlider") as HTMLInputElement;
const currTime = document.getElementById("currTime") as HTMLDivElement;
const totalTime = document.getElementById("totalTime") as HTMLDivElement;
const downloadWavBtn = document.getElementById("downloadWavBtn") as HTMLButtonElement;

const evalNotes = document.getElementById("evalNotes") as HTMLInputElement;
const saveEvalBtn = document.getElementById("saveEvalBtn") as HTMLButtonElement;
const historyTableBody = document.getElementById("historyTableBody") as HTMLTableSectionElement;
const exportLogsBtn = document.getElementById("exportLogsBtn") as HTMLButtonElement;
const clearHistoryBtn = document.getElementById("clearHistoryBtn") as HTMLButtonElement;

const visualizer = new Visualizer(waveformCanvas);

// Initialize UI
function init(): void {
  renderVoiceOptions();
  renderCategoryTabs();
  renderPresetList();
  selectPreset(KOREAN_SENTENCE_PRESETS[0].items[0]);
  setupEventListeners();
  updatePhoneticPreview();
}

// Render Voices with optgroups
function renderVoiceOptions(): void {
  const groups: Record<string, VoiceConfig[]> = {};
  for (const v of KOKORO_VOICES) {
    const groupName = v.group || "Other";
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(v);
  }

  let html = "";
  for (const [groupName, voices] of Object.entries(groups)) {
    html += `<optgroup label="--- ${groupName} ---">`;
    for (const v of voices) {
      html += `<option value="${v.id}">${v.name} [Grade ${v.grade}]</option>`;
    }
    html += `</optgroup>`;
  }

  voiceSelect.innerHTML = html;
  voiceSelect.value = "jf_alpha"; // Default to Asian CJK voice
  updateVoiceDescription();

  voiceSelect.addEventListener("change", updateVoiceDescription);
}

function updateVoiceDescription(): void {
  const selected = KOKORO_VOICES.find((v) => v.id === voiceSelect.value);
  if (selected) {
    voiceDesc.textContent = `${selected.name}: ${selected.traits}`;
  }
}

function renderCategoryTabs(): void {
  categoryTabs.innerHTML = KOREAN_SENTENCE_PRESETS.map((cat, idx) => `
    <button class="category-tab-btn ${idx === activeCategoryIdx ? "active" : ""}" data-idx="${idx}">
      ${cat.category.split(" ")[0]} ${cat.category.split("(")[1]?.replace(")", "") || ""}
    </button>
  `).join("");
}

function renderPresetList(): void {
  const currentCat = KOREAN_SENTENCE_PRESETS[activeCategoryIdx];
  if (!currentCat) return;

  presetList.innerHTML = currentCat.items.map((item) => `
    <div class="preset-card ${item.id === selectedPresetId ? "selected" : ""}" data-id="${item.id}">
      <div class="preset-korean">${item.korean}</div>
      <div class="preset-meta">
        <span class="preset-translation">${item.translation}</span>
        <span class="preset-focus">🎯 Focus: ${item.focus}</span>
      </div>
    </div>
  `).join("");
}

function selectPreset(preset: SentenceItem): void {
  selectedPresetId = preset.id;
  koreanInput.value = preset.korean;
  updateCharCount();
  updatePhoneticPreview();
  renderPresetList();
}

function updateCharCount(): void {
  const len = koreanInput.value.length;
  charCount.textContent = `${len} character${len !== 1 ? "s" : ""}`;
}

function updatePhoneticPreview(): void {
  if (isManualPhonemeEditing) return;

  const text = koreanInput.value.trim();
  if (!text) {
    phoneticPreviewText.textContent = "(입력된 한국어 텍스트가 없습니다)";
    manualPhonemeInput.value = "";
    return;
  }

  const converted = convertKoreanToSpeechText(text);
  phoneticPreviewText.textContent = converted;
  manualPhonemeInput.value = converted;
}

function setupEventListeners(): void {
  loadModelBtn.addEventListener("click", loadModel);

  categoryTabs.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".category-tab-btn") as HTMLElement | null;
    if (!btn || !btn.dataset.idx) return;
    activeCategoryIdx = parseInt(btn.dataset.idx, 10);
    renderCategoryTabs();
    renderPresetList();
  });

  presetList.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest(".preset-card") as HTMLElement | null;
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;
    const currentCat = KOREAN_SENTENCE_PRESETS[activeCategoryIdx];
    const item = currentCat.items.find((i) => i.id === id);
    if (item) selectPreset(item);
  });

  koreanInput.addEventListener("input", () => {
    selectedPresetId = null;
    renderPresetList();
    updateCharCount();
    updatePhoneticPreview();
  });

  toggleManualPhonemeBtn.addEventListener("click", () => {
    isManualPhonemeEditing = !isManualPhonemeEditing;
    if (isManualPhonemeEditing) {
      phoneticPreviewText.style.display = "none";
      manualPhonemeInput.style.display = "block";
      manualPhonemeInput.focus();
      toggleManualPhonemeBtn.textContent = "Done Editing";
    } else {
      phoneticPreviewText.textContent = manualPhonemeInput.value;
      phoneticPreviewText.style.display = "block";
      manualPhonemeInput.style.display = "none";
      toggleManualPhonemeBtn.textContent = "Edit Payload";
    }
  });

  speedRange.addEventListener("input", () => {
    speedVal.textContent = `${parseFloat(speedRange.value).toFixed(2)}x`;
  });

  generateBtn.addEventListener("click", generateSpeech);
  playBtn.addEventListener("click", togglePlay);

  seekSlider.addEventListener("input", () => {
    if (currentAudioDuration > 0) {
      const seekTime = (parseFloat(seekSlider.value) / 100) * currentAudioDuration;
      currTime.textContent = formatTime(seekTime);
    }
  });

  seekSlider.addEventListener("change", () => {
    if (currentAudioDuration > 0) {
      const seekTime = (parseFloat(seekSlider.value) / 100) * currentAudioDuration;
      if (isPlaying) {
        stopAudio();
        playAudio(seekTime);
      } else {
        pauseOffset = seekTime;
      }
    }
  });

  downloadWavBtn.addEventListener("click", downloadCurrentWav);

  document.querySelectorAll(".star-rating").forEach((group) => {
    const criteria = (group as HTMLElement).dataset.criteria as keyof typeof currentRatings;
    const scoreDisplay = group.querySelector(".rating-score") as HTMLElement;
    const stars = group.querySelectorAll(".star-btn");

    stars.forEach((star) => {
      star.addEventListener("click", () => {
        const val = parseInt((star as HTMLElement).dataset.val || "0", 10);
        currentRatings[criteria] = val;
        scoreDisplay.textContent = `${val}/5`;
        stars.forEach((s) => {
          const sVal = parseInt((s as HTMLElement).dataset.val || "0", 10);
          s.classList.toggle("active", sVal <= val);
        });
        checkSaveButtonState();
      });
    });
  });

  saveEvalBtn.addEventListener("click", saveEvaluationRecord);
  exportLogsBtn.addEventListener("click", exportHistoryJSON);
  clearHistoryBtn.addEventListener("click", clearHistory);
}

// Load Model (On-Demand CDN with browser CacheStorage)
async function loadModel(): Promise<void> {
  if (isModelLoading || ttsInstance) return;

  isModelLoading = true;
  loadModelBtn.disabled = true;
  statusDot.className = "status-indicator status-loading";
  statusText.textContent = "Loading Model & WASM...";
  progressBarContainer.style.display = "block";
  progressBarFill.style.width = "5%";
  progressPercentage.textContent = "5%";

  const selectedDevice = deviceSelect.value;
  const [device, dtype] = selectedDevice.split("_");

  try {
    const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
    progressLabel.textContent = `Loading Kokoro-82M (${dtype.toUpperCase()}) for ${device.toUpperCase()}...`;

    ttsInstance = await KokoroTTS.from_pretrained(modelId, {
      dtype: dtype as any,
      device: (device === "webgpu" ? "webgpu" : "wasm") as any,
      progress_callback: handleProgress,
    });

    statusDot.className = "status-indicator status-ready";
    statusText.textContent = `Kokoro 82M Ready (${device.toUpperCase()})`;
    loadModelBtn.innerHTML = `<span>Model Active</span>`;
    loadModelBtn.classList.remove("btn-primary");
    loadModelBtn.classList.add("btn-secondary");

    setTimeout(() => {
      progressBarContainer.style.display = "none";
    }, 1000);
  } catch (err: any) {
    console.error("Failed to load Kokoro model:", err);
    statusDot.className = "status-indicator status-offline";
    statusText.textContent = "Load Failed";
    loadModelBtn.disabled = false;
    progressLabel.textContent = `Error: ${err.message}`;
    alert(`Failed to load model: ${err.message}\nIf using WebGPU, ensure WebGPU is supported in your browser or switch to WASM.`);
  } finally {
    isModelLoading = false;
  }
}

function handleProgress(p: ProgressInfo): void {
  if (p.status === "progress" && p.progress) {
    const pct = Math.round(p.progress);
    progressBarFill.style.width = `${pct}%`;
    progressPercentage.textContent = `${pct}%`;
    if (p.file) {
      progressLabel.textContent = `Downloading ${p.file.split("/").pop()} (${pct}%)`;
    }
  } else if (p.status === "done") {
    progressBarFill.style.width = "100%";
    progressPercentage.textContent = "100%";
  }
}

// Download Voice Style Tensor on Demand from CDN and Cache in Memory / Browser Cache
async function getVoiceVector(voiceName: string): Promise<Float32Array> {
  if (voiceCache.has(voiceName)) {
    return voiceCache.get(voiceName)!;
  }

  const cdnUrl = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${voiceName}.bin`;

  let buffer: ArrayBuffer | null = null;
  try {
    let cache: Cache | null = null;
    try {
      cache = await caches.open("kokoro-voices");
      const matched = await cache.match(cdnUrl);
      if (matched) {
        buffer = await matched.arrayBuffer();
      }
    } catch (_) {}

    if (!buffer) {
      const res = await fetch(cdnUrl);
      if (!res.ok) throw new Error(`Could not fetch voice vector for ${voiceName}`);
      const clone = res.clone();
      buffer = await res.arrayBuffer();
      if (cache) {
        try {
          await cache.put(cdnUrl, clone);
        } catch (_) {}
      }
    }
  } catch (err: any) {
    throw new Error(`Failed to load voice vector for ${voiceName}: ${err.message}`);
  }

  const float32Array = new Float32Array(buffer);
  voiceCache.set(voiceName, float32Array);
  return float32Array;
}

// Generate Speech
async function generateSpeech(): Promise<void> {
  if (!ttsInstance) {
    await loadModel();
    if (!ttsInstance) return;
  }

  const koreanText = koreanInput.value.trim();
  if (!koreanText) {
    alert("Please enter or select a Korean sentence to test.");
    return;
  }

  const speechPayload = isManualPhonemeEditing
    ? manualPhonemeInput.value.trim()
    : (phoneticPreviewText.textContent || "").trim();

  if (!speechPayload) {
    alert("Phonetic payload is empty.");
    return;
  }

  const voiceId = voiceSelect.value;
  const speed = parseFloat(speedRange.value);

  generateBtn.disabled = true;
  genSpinner.style.display = "inline-block";
  genIcon.style.display = "none";
  genBtnText.textContent = "Synthesizing...";

  stopAudio();

  const startTime = performance.now();

  try {
    console.log(`Synthesizing payload: "${speechPayload}" with voice: ${voiceId}, speed: ${speed}`);

    // Tokenize phonetic payload
    const { input_ids } = (ttsInstance as any).tokenizer(speechPayload, { truncation: true });
    const voiceTensor = await getVoiceVector(voiceId);
    const numTokens = input_ids.dims.at(-1);
    const sliceIndex = 256 * Math.min(Math.max(numTokens - 2, 0), 509);
    const styleSlice = voiceTensor.slice(sliceIndex, sliceIndex + 256);

    const modelInputs = {
      input_ids: input_ids,
      style: new Tensor("float32", styleSlice, [1, 256]),
      speed: new Tensor("float32", [speed], [1]),
    };

    const { waveform } = await (ttsInstance as any).model(modelInputs);
    const rawAudio = new RawAudio(waveform.data, 24000);

    const elapsedMs = Math.round(performance.now() - startTime);
    const audioData = rawAudio.audio as Float32Array;
    const sampleRate = rawAudio.sampling_rate || 24000;
    const durationSec = audioData.length / sampleRate;
    const rtf = (elapsedMs / 1000) / durationSec;

    currentAudioBuffer = audioData;
    currentAudioDuration = durationSec;
    currentWavBlob = createWavBlob(audioData, sampleRate);

    currentRunMetadata = {
      id: Date.now(),
      korean: koreanText,
      payload: speechPayload,
      voice: voiceId,
      speed: speed,
      genTimeMs: elapsedMs,
      durationSec: durationSec,
      sampleRate: sampleRate,
      rtf: rtf,
      wavBlob: currentWavBlob,
    };

    // Update Player & Visualizer UI
    metricGenTime.textContent = `${elapsedMs}ms`;
    metricDuration.textContent = `${durationSec.toFixed(2)}s`;
    metricRtf.textContent = `${rtf.toFixed(2)}x RTF`;
    audioMetrics.style.display = "inline-flex";

    visualizerOverlay.style.display = "none";
    visualizer.drawWaveformStatic(audioData);

    playBtn.disabled = false;
    seekSlider.disabled = false;
    downloadWavBtn.disabled = false;
    totalTime.textContent = formatTime(durationSec);
    currTime.textContent = "00:00";
    seekSlider.value = "0";

    checkSaveButtonState();
    playAudio(0);
  } catch (err: any) {
    console.error("Speech synthesis failed:", err);
    alert(`Speech generation error: ${err.message}`);
  } finally {
    generateBtn.disabled = false;
    genSpinner.style.display = "none";
    genIcon.style.display = "inline-block";
    genBtnText.textContent = "Synthesize Speech (WASM)";
  }
}

// Audio Playback
function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioCtx({ sampleRate: 24000 });
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

function playAudio(startOffset: number = 0): void {
  if (!currentAudioBuffer) return;

  const ctx = getAudioContext();
  stopAudio();

  const buffer = ctx.createBuffer(1, currentAudioBuffer.length, 24000);
  buffer.getChannelData(0).set(currentAudioBuffer);

  activeAudioSource = ctx.createBufferSource();
  activeAudioSource.buffer = buffer;

  if (analyserNode) {
    activeAudioSource.connect(analyserNode);
    analyserNode.connect(ctx.destination);
    visualizer.startLive(analyserNode);
  }

  playStartTime = ctx.currentTime - startOffset;
  pauseOffset = startOffset;
  activeAudioSource.start(0, startOffset);
  isPlaying = true;

  playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

  activeAudioSource.onended = () => {
    if (isPlaying) {
      stopAudio();
      visualizer.drawWaveformStatic(currentAudioBuffer);
    }
  };

  startProgressLoop();
}

function stopAudio(): void {
  if (activeAudioSource) {
    try {
      activeAudioSource.stop();
      activeAudioSource.disconnect();
    } catch (_) {}
    activeAudioSource = null;
  }
  isPlaying = false;
  visualizer.stopLive();
  if (playbackTimer !== null) {
    cancelAnimationFrame(playbackTimer);
    playbackTimer = null;
  }
  playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
}

function togglePlay(): void {
  if (!currentAudioBuffer) return;

  if (isPlaying) {
    const ctx = getAudioContext();
    pauseOffset = ctx.currentTime - playStartTime;
    stopAudio();
    visualizer.drawWaveformStatic(currentAudioBuffer);
  } else {
    if (pauseOffset >= currentAudioDuration) pauseOffset = 0;
    playAudio(pauseOffset);
  }
}

function startProgressLoop(): void {
  const update = () => {
    if (!isPlaying) return;
    const ctx = getAudioContext();
    const current = Math.min(ctx.currentTime - playStartTime, currentAudioDuration);
    currTime.textContent = formatTime(current);
    seekSlider.value = String((current / currentAudioDuration) * 100);

    if (current < currentAudioDuration) {
      playbackTimer = requestAnimationFrame(update);
    }
  };
  playbackTimer = requestAnimationFrame(update);
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function downloadCurrentWav(): void {
  if (!currentWavBlob) return;
  const url = URL.createObjectURL(currentWavBlob);
  const a = document.createElement("a");
  a.href = url;
  const filename = `kokoro_korean_${voiceSelect.value}_${Date.now()}.wav`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function checkSaveButtonState(): void {
  saveEvalBtn.disabled = !currentRunMetadata;
}

function saveEvaluationRecord(): void {
  if (!currentRunMetadata) return;

  const totalScore = (
    currentRatings.naturalness +
    currentRatings.pronunciation +
    currentRatings.intonation +
    currentRatings.clarity
  ) / (currentRatings.naturalness ? 4 : 1);

  const record: TestRecord = {
    ...currentRunMetadata,
    ratings: { ...currentRatings },
    averageScore: totalScore > 0 ? totalScore.toFixed(1) : "N/A",
    notes: evalNotes.value.trim() || "-",
    timestamp: new Date().toLocaleTimeString(),
  };

  testHistory.unshift(record);
  renderHistoryTable();

  evalNotes.value = "";
  alert("Quality evaluation record saved to test run history!");
}

function renderHistoryTable(): void {
  if (testHistory.length === 0) {
    historyTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">No test runs recorded yet. Generate speech above to add records.</td>
      </tr>
    `;
    return;
  }

  historyTableBody.innerHTML = testHistory.map((item, idx) => `
    <tr>
      <td>${testHistory.length - idx}</td>
      <td class="history-korean" title="${item.korean}">${item.korean}</td>
      <td class="history-phonetic" title="${item.payload}">${item.payload}</td>
      <td><strong>${item.voice}</strong></td>
      <td>${item.speed}x</td>
      <td>${item.genTimeMs}ms (${item.durationSec.toFixed(1)}s)</td>
      <td>
        <span class="history-score-badge">
          ★ ${item.averageScore !== "N/A" ? item.averageScore + "/5" : "Unrated"}
        </span>
      </td>
      <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.notes || "-"}</td>
      <td>
        <div style="display: flex; gap: 0.3rem;">
          <button class="btn btn-primary btn-sm play-history-btn" data-id="${item.id}">Play</button>
          <button class="btn btn-secondary btn-sm dl-history-btn" data-id="${item.id}">WAV</button>
        </div>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".play-history-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt((btn as HTMLElement).dataset.id || "0", 10);
      const record = testHistory.find((r) => r.id === id);
      if (record && record.wavBlob) {
        const audio = new Audio(URL.createObjectURL(record.wavBlob));
        audio.play();
      }
    });
  });

  document.querySelectorAll(".dl-history-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt((btn as HTMLElement).dataset.id || "0", 10);
      const record = testHistory.find((r) => r.id === id);
      if (record && record.wavBlob) {
        const url = URL.createObjectURL(record.wavBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kokoro_korean_${record.voice}_${record.id}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  });
}

function exportHistoryJSON(): void {
  if (testHistory.length === 0) {
    alert("No test history to export.");
    return;
  }

  const exportData = testHistory.map((item) => {
    const { wavBlob: _unused, ...rest } = item;
    return rest;
  });

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kokoro_korean_test_report_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function clearHistory(): void {
  if (confirm("Are you sure you want to clear all test history?")) {
    testHistory.length = 0;
    renderHistoryTable();
  }
}

document.addEventListener("DOMContentLoaded", init);
