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
      assert.equal(koreanToIpa("자"), "ʨa");
      assert.equal(koreanToIpa("짜"), "ʨ͈a");
      assert.equal(koreanToIpa("차"), "ʨʰa");
    });
  });

  describe("2. Assimilated & Allophonic IPA Output", () => {
    it("should transcribe '감사합니다' with nasalization and intervocalic voicing", () => {
      const ipa = koreanToIpa("감사합니다");
      assert.equal(ipa, "kamsahamnida");
    });

    it("should transcribe '국밥' with tensification (ㅂ -> ㅃ)", () => {
      const ipa = koreanToIpa("국밥");
      assert.equal(ipa, "kuk̚p͈ap̚");
    });

    it("should transcribe '굳이' with palatalization (ㄷ -> ㅈ -> ʥ)", () => {
      const ipa = koreanToIpa("굳이");
      assert.equal(ipa, "kuʥi");
    });

    it("should transcribe '좋다' with aspiration (ㅎ+ㄷ -> ㅌ)", () => {
      const ipa = koreanToIpa("좋다");
      assert.equal(ipa, "ʨotʰa");
    });

    it("should transcribe '신라' with lateral gemination (ll) and palatalized (ɕ)", () => {
      const ipa = koreanToIpa("신라");
      assert.equal(ipa, "ɕilla");
    });

    it("should transcribe '시간' with palatalized (ɕ) and voiced (ɡ)", () => {
      const ipa = koreanToIpa("시간");
      assert.equal(ipa, "ɕiɡan");
    });

    it("should transcribe '아버지' with intervocalic voiced (b) and (ʥ)", () => {
      const ipa = koreanToIpa("아버지");
      assert.equal(ipa, "abʌʥi");
    });

    it("should transcribe '친구' with post-nasal voiced (ɡ)", () => {
      const ipa = koreanToIpa("친구");
      assert.equal(ipa, "ʨʰinɡu");
    });

    it("should transcribe '국립' with liquid nasalization (ㄱ+ㄹ -> ㅇ+ㄴ)", () => {
      const ipa = koreanToIpa("국립");
      assert.equal(ipa, "kuŋnip̚");
    });

    it("should correctly transcribe issue #1 words (휴지, 내일, 타조, 초코, 된장)", () => {
      assert.equal(koreanToIpa("휴지"), "hjuʥi");
      assert.equal(koreanToIpa("내일"), "nɛˌil");
      assert.equal(koreanToIpa("타조"), "tʰaʥo");
      assert.equal(koreanToIpa("초코"), "ʨʰokʰo");
      assert.equal(koreanToIpa("된장"), "twenʥaŋ");
    });

    it("should apply vowel hiatus separation across zero-onset syllables", () => {
      assert.equal(koreanToIpa("오이"), "oˌi");
      assert.equal(koreanToIpa("아이"), "aˌi");
      assert.equal(koreanToIpa("여우"), "jʌˌu");
      assert.equal(koreanToIpa("새우"), "sɛˌu");
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
