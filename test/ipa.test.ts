import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  koreanToIpa,
  convertKoreanToSpeechText,
  KOREAN_SENTENCE_PRESETS,
} from "../src/korean-engine.ts";

describe("Hangul to IPA Conversion (음소 변환 및 Kokoro IPA)", () => {
  describe("1. Basic Phoneme Mappings", () => {
    it("should correctly transcribe basic vowels (monophthongs)", () => {
      assert.equal(koreanToIpa("아"), "a");
      assert.equal(koreanToIpa("어"), "ʌ");
      assert.equal(koreanToIpa("오"), "o");
      assert.equal(koreanToIpa("우"), "u");
      assert.equal(koreanToIpa("으"), "ɯ");
      assert.equal(koreanToIpa("이"), "i");
      assert.equal(koreanToIpa("애"), "ɛ");
      assert.equal(koreanToIpa("에"), "e");
    });

    it("should correctly transcribe diphthongs & glides", () => {
      assert.equal(koreanToIpa("야"), "ja");
      assert.equal(koreanToIpa("여"), "jʌ");
      assert.equal(koreanToIpa("요"), "jo");
      assert.equal(koreanToIpa("유"), "ju");
      assert.equal(koreanToIpa("와"), "wa");
      assert.equal(koreanToIpa("왜"), "wɛ");
      assert.equal(koreanToIpa("워"), "wʌ");
      assert.equal(koreanToIpa("웨"), "we");
      assert.equal(koreanToIpa("의"), "ɰi");
    });

    it("should correctly transcribe consonant tension and aspiration", () => {
      assert.equal(koreanToIpa("가"), "ka");
      assert.equal(koreanToIpa("까"), "k͈a");
      assert.equal(koreanToIpa("카"), "kʰa");
      assert.equal(koreanToIpa("다"), "ta");
      assert.equal(koreanToIpa("따"), "t͈a");
      assert.equal(koreanToIpa("타"), "tʰa");
      assert.equal(koreanToIpa("바"), "pa");
      assert.equal(koreanToIpa("빠"), "p͈a");
      assert.equal(koreanToIpa("파"), "pʰa");
      assert.equal(koreanToIpa("사"), "sa");
      assert.equal(koreanToIpa("싸"), "s͈a");
      assert.equal(koreanToIpa("자"), "t͡ɕa");
      assert.equal(koreanToIpa("짜"), "t͡ɕ͈a");
      assert.equal(koreanToIpa("차"), "t͡ɕʰa");
    });
  });

  describe("2. Assimilated IPA Output", () => {
    it("should transcribe '감사합니다' with nasalization (ㅂ -> ㅁ)", () => {
      const ipa = koreanToIpa("감사합니다");
      assert.equal(ipa, "kamsahamnita");
    });

    it("should transcribe '국밥' with tensification (ㅂ -> ㅃ)", () => {
      const ipa = koreanToIpa("국밥");
      assert.equal(ipa, "kuk̚p͈ap̚");
    });

    it("should transcribe '굳이' with palatalization (ㄷ -> ㅈ)", () => {
      const ipa = koreanToIpa("굳이");
      assert.equal(ipa, "kut͡ɕi");
    });

    it("should transcribe '좋다' with aspiration (ㅎ+ㄷ -> ㅌ)", () => {
      const ipa = koreanToIpa("좋다");
      assert.equal(ipa, "t͡ɕotʰa");
    });

    it("should transcribe '신라' with lateralization (ㄴ+ㄹ -> ㄹㄹ)", () => {
      const ipa = koreanToIpa("신라");
      assert.equal(ipa, "silɾa");
    });

    it("should transcribe '국립' with liquid nasalization (ㄱ+ㄹ -> ㅇ+ㄴ)", () => {
      const ipa = koreanToIpa("국립");
      assert.equal(ipa, "kuŋnip̚");
    });
  });

  describe("3. Preset Sentences IPA Generation", () => {
    it("should successfully generate non-empty IPA for all preset sentences", () => {
      for (const category of KOREAN_SENTENCE_PRESETS) {
        for (const item of category.items) {
          const ipa = koreanToIpa(item.korean);
          assert.ok(ipa.length > 0, `IPA for "${item.korean}" should not be empty`);
          assert.doesNotMatch(ipa, /[가-힣]/, `IPA for "${item.korean}" should not contain unparsed Hangul`);
        }
      }
    });
  });

  describe("4. Preserving Punctuation and Spacing", () => {
    it("should preserve spaces, commas, periods, and exclamation marks", () => {
      const input = "안녕하세요, 만나서 반갑습니다!";
      const ipa = koreanToIpa(input);
      assert.ok(ipa.includes(", "));
      assert.ok(ipa.endsWith("!"));
    });
  });
});
