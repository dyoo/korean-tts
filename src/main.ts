import {
  KoreanSpeaker,
  type SpeakerProgress,
  type StorageInfo,
} from "./korean-speaker";
import {
  KOREAN_SENTENCE_PRESETS,
  type SentenceItem,
  type VoiceConfig,
} from "./korean-engine";
import { Visualizer } from "./audio-utils";

// KoreanSpeaker Instance
const speaker = new KoreanSpeaker();

// State
let isModelLoading: boolean = false;
let currentAudioBuffer: Float32Array | null = null;
let currentWavBlob: Blob | null = null;
let currentAudioDuration: number = 0;

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

// DOM Elements
const loadModelBtn = document.getElementById("loadModelBtn") as HTMLButtonElement;
const statusDot = document.getElementById("statusDot") as HTMLSpanElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const storageText = document.getElementById("storageText") as HTMLSpanElement;
const clearCacheBtn = document.getElementById("clearCacheBtn") as HTMLButtonElement;
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

const visualizer = new Visualizer(waveformCanvas);

// Initialize UI
function init(): void {
  renderVoiceOptions();
  renderCategoryTabs();
  renderPresetList();
  selectPreset(KOREAN_SENTENCE_PRESETS[0].items[0]);
  setupEventListeners();
  updatePhoneticPreview();
  updateStorageBadge();
}

// Render Voices with optgroups
function renderVoiceOptions(): void {
  const voices = speaker.getVoices();
  const groups: Record<string, VoiceConfig[]> = {};
  for (const v of voices) {
    const groupName = v.group || "Other";
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(v);
  }

  let html = "";
  for (const [groupName, vList] of Object.entries(groups)) {
    html += `<optgroup label="--- ${groupName} ---">`;
    for (const v of vList) {
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
  const voices = speaker.getVoices();
  const selected = voices.find((v) => v.id === voiceSelect.value);
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

  const converted = speaker.textToIpa(text);
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
  clearCacheBtn.addEventListener("click", handleClearCache);
}

// Storage Status Monitoring
async function updateStorageBadge(): Promise<StorageInfo> {
  const info = await speaker.getStorageInfo();
  if (info.isCached && info.modelSizeBytes > 0) {
    storageText.textContent = `Storage: ${info.modelSizeFormatted} (Offline Cached)`;
    clearCacheBtn.style.display = "inline-flex";
  } else {
    storageText.textContent = "Storage: None (On-demand)";
    clearCacheBtn.style.display = "none";
  }
  return info;
}

// Handle Cache Deletion
async function handleClearCache(): Promise<void> {
  const confirmed = confirm(
    "Delete cached Kokoro model files (~86 MB)?\n\nThis will free up browser storage. Subsequent speech generation will re-download the model from CDN."
  );
  if (!confirmed) return;

  clearCacheBtn.disabled = true;
  storageText.textContent = "Deleting cache...";

  await speaker.clearStorage();

  statusDot.className = "status-indicator status-offline";
  statusText.textContent = "Model Not Loaded";
  loadModelBtn.disabled = false;
  loadModelBtn.className = "btn btn-primary btn-sm";
  loadModelBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
    <span>Load Model (82M WASM)</span>
  `;
  generateBtn.disabled = true;

  clearCacheBtn.disabled = false;
  await updateStorageBadge();
}

// Load Model (Delegates to KoreanSpeaker)
async function loadModel(): Promise<void> {
  if (isModelLoading || speaker.isLoaded()) return;

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
    progressLabel.textContent = `Loading Kokoro-82M (${dtype.toUpperCase()}) for ${device.toUpperCase()}...`;

    await speaker.load({
      dtype: dtype as any,
      device: (device === "webgpu" ? "webgpu" : "wasm") as any,
      progressCallback: handleProgress,
    });

    statusDot.className = "status-indicator status-ready";
    statusText.textContent = `Kokoro 82M Ready (${device.toUpperCase()})`;
    loadModelBtn.innerHTML = `<span>Model Active</span>`;
    loadModelBtn.classList.remove("btn-primary");
    loadModelBtn.classList.add("btn-secondary");

    setTimeout(() => {
      progressBarContainer.style.display = "none";
    }, 1000);

    // Refresh storage usage display after successful model download
    await updateStorageBadge();
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

function handleProgress(p: SpeakerProgress): void {
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

// Generate Speech (Delegates to KoreanSpeaker)
async function generateSpeech(): Promise<void> {
  if (!speaker.isLoaded()) {
    await loadModel();
    if (!speaker.isLoaded()) return;
  }

  const koreanText = koreanInput.value.trim();
  if (!koreanText) {
    alert("Please enter or select a Korean sentence to test.");
    return;
  }

  const speechPayload = isManualPhonemeEditing
    ? manualPhonemeInput.value.trim()
    : koreanText;

  if (!speechPayload) {
    alert("Input text or phonetic payload is empty.");
    return;
  }

  const voiceId = voiceSelect.value;
  const speed = parseFloat(speedRange.value);

  generateBtn.disabled = true;
  genSpinner.style.display = "inline-block";
  genIcon.style.display = "none";
  genBtnText.textContent = "Synthesizing...";

  stopAudio();

  try {
    const result = await speaker.synthesize(speechPayload, {
      voice: voiceId,
      speed,
      isIpa: isManualPhonemeEditing,
    });

    currentAudioBuffer = result.audio;
    currentAudioDuration = result.durationSec;
    currentWavBlob = result.toWavBlob();

    // Update Player & Visualizer UI
    metricGenTime.textContent = `${result.genTimeMs}ms`;
    metricDuration.textContent = `${result.durationSec.toFixed(2)}s`;
    metricRtf.textContent = `${result.rtf.toFixed(2)}x RTF`;
    audioMetrics.style.display = "inline-flex";

    visualizerOverlay.style.display = "none";
    visualizer.drawWaveformStatic(result.audio);

    playBtn.disabled = false;
    seekSlider.disabled = false;
    downloadWavBtn.disabled = false;
    totalTime.textContent = formatTime(result.durationSec);
    currTime.textContent = "00:00";
    seekSlider.value = "0";

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

document.addEventListener("DOMContentLoaded", init);
