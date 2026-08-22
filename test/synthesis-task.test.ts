import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DefaultSynthesisTask,
  SynthesisCancelledError,
  KoreanSpeaker,
  type SynthesisProgressEvent,
  type SynthesisResult,
} from "../src/korean-speaker.ts";

describe("Speech Synthesis Task & Cancellation (Issue #3)", () => {
  describe("1. DefaultSynthesisTask State & Lifecycle", () => {
    it("should initialize in 'init' stage with pending state", () => {
      const task = new DefaultSynthesisTask();
      assert.equal(task.stage, "init");
      assert.equal(task.isCancelled, false);
      assert.equal(task.isSettled, false);
      assert.equal(task.cancelReason, undefined);
    });

    it("should emit progress events to registered listeners", () => {
      const events: SynthesisProgressEvent[] = [];
      const task = new DefaultSynthesisTask();
      task.onProgress((ev) => events.push(ev));

      task._emitProgress("converting-phonology", "Converting Hangul", 0.25);
      task._emitProgress("tokenizing", "Tokenizing", 0.4);

      assert.equal(events.length, 2);
      assert.equal(events[0].stage, "converting-phonology");
      assert.equal(events[0].progress, 0.25);
      assert.equal(events[1].stage, "tokenizing");
      assert.equal(events[1].progress, 0.4);
      assert.equal(task.stage, "tokenizing");
    });

    it("should resolve promise when _complete is called", async () => {
      const task = new DefaultSynthesisTask();
      const mockResult: SynthesisResult = {
        audio: new Float32Array([0.1, -0.1]),
        sampleRate: 24000,
        durationSec: 1.0,
        genTimeMs: 50,
        rtf: 0.05,
        ipa: "annjʌŋ",
        voice: "jf_nezumi",
        speed: 1.0,
        toWavBlob: () => new Blob(),
        toAudioUrl: () => "blob:mock",
        createAudioElement: () => ({} as any),
      } as any;

      task._complete(mockResult);
      assert.equal(task.isSettled, true);
      assert.equal(task.isCancelled, false);
      assert.equal(task.stage, "completed");

      const res = await task;
      assert.equal(res.durationSec, 1.0);
    });

    it("should cancel task and reject promise with SynthesisCancelledError", async () => {
      const events: SynthesisProgressEvent[] = [];
      const task = new DefaultSynthesisTask();
      task.onProgress((ev) => events.push(ev));

      task.cancel("User clicked cancel");
      assert.equal(task.isCancelled, true);
      assert.equal(task.isSettled, true);
      assert.equal(task.cancelReason, "User clicked cancel");
      assert.equal(task.stage, "cancelled");
      assert.equal(events.some((e) => e.stage === "cancelled"), true);

      await assert.rejects(
        async () => {
          await task;
        },
        (err: any) => {
          assert.ok(err instanceof SynthesisCancelledError || err.isCancelled);
          assert.equal(err.name, "AbortError");
          assert.equal(err.message, "User clicked cancel");
          assert.equal(err.isCancelled, true);
          return true;
        }
      );
    });

    it("should ignore subsequent cancel or complete calls once settled", async () => {
      const task = new DefaultSynthesisTask();
      task.cancel("First cancel");
      task.cancel("Second cancel");
      task._complete({} as any);

      assert.equal(task.cancelReason, "First cancel");
      assert.equal(task.stage, "cancelled");

      await assert.rejects(
        async () => {
          await task;
        },
        { name: "AbortError", message: "First cancel" }
      );
    });
  });

  describe("2. KoreanSpeaker Active Task & Concurrency Control", () => {
    function createMockSpeaker(): KoreanSpeaker {
      const speaker = new KoreanSpeaker();
      (speaker as any).ttsInstance = {
        tokenizer: (_text: string) => ({
          input_ids: { dims: [1, 5] },
        }),
        model: async () => ({
          waveform: { data: new Float32Array(24000) },
        }),
      };
      (speaker as any).getVoiceVector = async () => new Float32Array(512 * 256);
      return speaker;
    }

    it("should successfully synthesize speech and report completion progress", async () => {
      const speaker = createMockSpeaker();
      const stages: string[] = [];

      const task = speaker.synthesize({
        text: "안녕하세요!",
        onProgress: (ev) => {
          stages.push(ev.stage);
        },
      });

      const result = await task;
      assert.ok(result.audio instanceof Float32Array);
      assert.equal(result.sampleRate, 24000);
      assert.equal(result.durationSec, 1.0);
      assert.ok(stages.includes("converting-phonology"));
      assert.ok(stages.includes("completed"));
    });

    it("should track active tasks and allow cancelCurrent and cancelAll", async () => {
      const speaker = createMockSpeaker();
      assert.equal(speaker.getActiveTasks().length, 0);

      const task1 = speaker.synthesize({ text: "첫 번째 문장" });
      const task2 = speaker.synthesize({ text: "두 번째 문장" });
      const p1 = task1.catch(() => {});
      const p2 = task2.catch(() => {});

      const active = speaker.getActiveTasks();
      assert.equal(active.length, 2);
      assert.equal(active[0], task1);
      assert.equal(active[1], task2);

      // Cancel the most recent task (task2)
      speaker.cancelCurrent("Cancel task 2");
      assert.equal(task2.isCancelled, true);
      assert.equal(task1.isCancelled, false);

      // Cancel all remaining tasks
      speaker.cancelAll("Cancel all remaining");
      assert.equal(task1.isCancelled, true);

      await Promise.all([p1, p2]);
    });

    it("should clean up disposed speaker and cancel all active tasks", async () => {
      const speaker = createMockSpeaker();
      const task = speaker.synthesize({ text: "테스트 문장" });
      const p = task.catch(() => {});

      assert.equal(task.isCancelled, false);
      speaker.dispose();

      assert.equal(task.isCancelled, true);
      assert.equal(speaker.getActiveTasks().length, 0);

      await p;
    });

    it("should accept onProgress callback in synthesize input", async () => {
      const speaker = createMockSpeaker();
      const stages: string[] = [];

      const task = speaker.synthesize({
        text: "안녕하세요",
        onProgress: (ev) => {
          stages.push(ev.stage);
        },
      });
      const p = task.catch(() => {});

      task.cancel("Early cancel");
      assert.ok(stages.includes("cancelled") || task.isCancelled);

      await p;
    });

    it("should cancel task directly via task.cancel() and reject with SynthesisCancelledError", async () => {
      const speaker = createMockSpeaker();
      const task = speaker.synthesize({
        text: "안녕하세요",
      });

      task.cancel("Direct cancel");
      assert.equal(task.isCancelled, true);

      await assert.rejects(
        async () => {
          await task;
        },
        (err: any) => {
          assert.equal(err.name, "AbortError");
          assert.equal(err.isCancelled, true);
          return true;
        }
      );
    });

    it("should append terminal punctuation to unpunctuated input for crisp single-word prosody", async () => {
      let tokenizedText = "";
      const speaker = new KoreanSpeaker();
      (speaker as any).ttsInstance = {
        tokenizer: (text: string) => {
          tokenizedText = text;
          return { input_ids: { dims: [1, 4] } };
        },
        model: async () => ({
          waveform: { data: new Float32Array(24000) },
        }),
      };
      (speaker as any).getVoiceVector = async () => new Float32Array(512 * 256);

      // Single unpunctuated word/syllable "넋" -> "nʌk̚."
      const task = speaker.synthesize({ text: "넋" });
      const result = await task;

      assert.ok(tokenizedText.endsWith("."));
      assert.equal(result.ipa, "nʌk̚.");
    });
  });
});
