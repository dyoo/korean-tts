import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeKoreanText,
  numberToKorean,
  numberToNativeKorean,
} from "../src/korean-engine.ts";

describe("Korean Text & Number Normalization", () => {
  describe("1. Sino-Korean Numbers", () => {
    const testCases: [string, string][] = [
      ["0", "영"],
      ["1", "일"],
      ["10", "십"],
      ["15", "십오"],
      ["100", "백"],
      ["123", "백이십삼"],
      ["1000", "천"],
      ["2026", "이천이십육"],
      ["10000", "일만"],
      ["24500", "이만 사천오백"],
      ["100000000", "일억"],
    ];

    for (const [input, expected] of testCases) {
      it(`should convert "${input}" -> "${expected}"`, () => {
        assert.equal(numberToKorean(input), expected);
      });
    }
  });

  describe("2. Native Korean Numbers (순우리말 수사)", () => {
    const testCases: [number, boolean, string][] = [
      [1, true, "한"],
      [1, false, "하나"],
      [2, true, "두"],
      [2, false, "둘"],
      [3, true, "세"],
      [3, false, "셋"],
      [4, true, "네"],
      [4, false, "넷"],
      [5, true, "다섯"],
      [10, true, "열"],
      [11, true, "열한"],
      [12, true, "열두"],
      [20, true, "스무"],
      [20, false, "스물"],
      [21, true, "스물한"],
      [35, true, "서른다섯"],
      [99, true, "아흔아홉"],
    ];

    for (const [num, attr, expected] of testCases) {
      it(`should convert ${num} (attr=${attr}) -> "${expected}"`, () => {
        assert.equal(numberToNativeKorean(num, attr), expected);
      });
    }
  });

  describe("3. Native Korean Counting Units in Sentences", () => {
    const testCases: [string, string][] = [
      ["사과 1개 주세요.", "사과 한 개 주세요."],
      ["학생 2명과 선생님 1명", "학생 두 명과 선생님 한 명"],
      ["커피 3잔 주문합니다.", "커피 세 잔 주문합니다."],
      ["강아지 4마리가 있어요.", "강아지 네 마리가 있어요."],
      ["책 5권을 읽었습니다.", "책 다섯 권을 읽었습니다."],
      ["올해 20살이 되었습니다.", "올해 스무 살이 되었습니다."],
      ["21살 대학생입니다.", "스물한 살 대학생입니다."],
      ["3번 반복하세요.", "세 번 반복하세요."],
    ];

    for (const [input, expected] of testCases) {
      it(`should normalize counting units in "${input}"`, () => {
        assert.equal(normalizeKoreanText(input), expected);
      });
    }
  });

  describe("4. Time, Dates & Currency Normalization", () => {
    it("should normalize dates", () => {
      assert.equal(normalizeKoreanText("2026년 8월 15일"), "이천이십육년 팔월 십오일");
    });

    it("should normalize times with native hours and Sino minutes", () => {
      assert.equal(normalizeKoreanText("3시 30분"), "세시 삼십분");
      assert.equal(normalizeKoreanText("12시 5분"), "열두시 오분");
      assert.equal(normalizeKoreanText("오후 1시"), "오후 한시");
    });

    it("should normalize currency with commas", () => {
      assert.equal(normalizeKoreanText("24,500원"), "이만 사천오백원");
      assert.equal(normalizeKoreanText("1,000,000원"), "백만원");
    });
  });

  describe("5. English Letters & Acronyms Transliteration", () => {
    it("should expand English acronyms to Korean phonetic pronunciation", () => {
      assert.equal(normalizeKoreanText("AI 모델"), "에이아이 모델");
      assert.equal(normalizeKoreanText("TTS 엔진"), "티티에스 엔진");
      assert.equal(normalizeKoreanText("OK"), "오케이");
    });
  });
});
