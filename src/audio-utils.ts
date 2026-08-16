// Audio utilities: WAV header creation, Web Audio playback, and Canvas Visualization

export function createWavBlob(float32Array: Float32Array, sampleRate: number = 24000): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = float32Array.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Write RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // Write fmt subchunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // Write data subchunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Convert Float32 to Int16
  let offset = 44;
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export class Visualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private animationId: number | null = null;
  private analyser: AnalyserNode | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  setAnalyser(analyser: AnalyserNode): void {
    this.analyser = analyser;
  }

  drawWaveformStatic(float32Data: Float32Array | null): void {
    if (!this.canvas || !this.ctx) return;
    const parentWidth = this.canvas.parentElement?.clientWidth || 600;
    const width = (this.canvas.width = parentWidth * window.devicePixelRatio);
    const height = (this.canvas.height = 100 * window.devicePixelRatio);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    // Draw center line
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!float32Data || float32Data.length === 0) return;

    ctx.fillStyle = "#38bdf8";
    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 2;

    const step = Math.ceil(float32Data.length / width);
    const amp = height / 2;

    ctx.beginPath();
    ctx.moveTo(0, height / 2);

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = float32Data[i * step + j];
        if (datum !== undefined) {
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }
      const yMin = (1 + min) * amp;
      const yMax = (1 + max) * amp;
      ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
    }
  }

  startLive(analyser: AnalyserNode): void {
    this.analyser = analyser;
    this.stopLive();

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      this.animationId = requestAnimationFrame(render);
      if (!this.canvas || !this.ctx || !this.analyser) return;

      const parentWidth = this.canvas.parentElement?.clientWidth || 600;
      const width = (this.canvas.width = parentWidth * window.devicePixelRatio);
      const height = (this.canvas.height = 100 * window.devicePixelRatio);
      const ctx = this.ctx;

      this.analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let barHeight: number;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height;

        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, "#38bdf8");
        gradient.addColorStop(0.5, "#818cf8");
        gradient.addColorStop(1, "#c084fc");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

        x += barWidth + 1;
        if (x > width) break;
      }
    };

    render();
  }

  stopLive(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}
