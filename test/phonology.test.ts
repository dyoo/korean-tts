import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  koreanToPronunciation,
  applyPhonologicalRules,
  decomposeHangul,
  composeHangul,
  syllablesToHangul,
  type SyllableToken,
} from "../src/korean-engine.ts";

describe("Standard Korean Phonology Engine (표준 발음법)", () => {
  describe("1. Palatalization (구개음화: ㄷ/ㅌ/ㄾ + 이/여 -> ㅈ/ㅊ)", () => {
    const testCases: [string, string][] = [
      ["굳이", "구지"],
      ["미닫이", "미다지"],
      ["해돋이", "해도지"],
      ["같이", "가치"],
      ["밭이", "바치"],
      ["붙이다", "부치다"],
      ["핥이다", "할치다"],
      ["벼훑이", "벼훌치"],
      ["닫히다", "다치다"],
      ["묻히다", "무치다"],
    ];

    for (const [input, expected] of testCases) {
      it(`should palatalize "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("2. Aspiration (격음화 / 자음 축약)", () => {
    const testCases: [string, string][] = [
      ["축하", "추카"],
      ["각하", "가카"],
      ["입학", "이팍"],
      ["맏형", "마텽"],
      ["맞히다", "마치다"],
      ["밝히다", "발키다"],
      ["얽히고", "얼키고"],
      ["앉히다", "안치다"],
      ["넓히다", "널피다"],
      ["좋다", "조타"],
      ["놓고", "노코"],
      ["많다", "만타"],
      ["싫다", "실타"],
      ["좋지", "조치"],
      ["많지", "만치"],
      ["싫지", "실치"],
      ["좋소", "조쏘"],
      ["많소", "만쏘"],
      ["싫소", "실쏘"],
    ];

    for (const [input, expected] of testCases) {
      it(`should aspirate "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("3. Liaison & ㅎ-Elision (연음법칙 및 ㅎ 탈락)", () => {
    const testCases: [string, string][] = [
      // Single codas
      ["한국어", "한구거"],
      ["음악", "으막"],
      ["밥을", "바블"],
      ["옷이", "오시"],
      ["꽃이", "꼬치"],
      ["꽃을", "꼬츨"],
      ["빛이", "비치"],
      ["있어", "이써"],
      ["강이", "강이"], // Coda ㅇ stays ŋ
      // Double codas (겹받침)
      ["닭을", "달글"],
      ["흙이", "흘기"],
      ["읽어", "일거"],
      ["값이", "갑씨"],
      ["없어", "업써"],
      ["삶이", "살미"],
      ["젊어", "절머"],
      ["여덟이", "여덜비"],
      ["넓어", "널버"],
      ["핥아", "할타"],
      ["읊어", "을퍼"],
      ["앉아", "안자"],
      // ㅎ-elision before vowel
      ["좋아", "조아"],
      ["넣어", "너어"],
      ["쌓이다", "싸이다"],
      ["많이", "마니"],
      ["싫어", "시러"],
      ["잃어", "이러"],
      ["끓여", "끄려"],
    ];

    for (const [input, expected] of testCases) {
      it(`should apply liaison on "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("4. Nasalization (비음화)", () => {
    const testCases: [string, string][] = [
      ["국물", "궁물"],
      ["먹는", "멍는"],
      ["깎는", "깡는"],
      ["한국말", "한궁말"],
      ["밥물", "밤물"],
      ["감사합니다", "감사함니다"],
      ["없는", "엄는"],
      ["앞마당", "암마당"],
      ["닫는", "단는"],
      ["있는", "인는"],
      ["맞는", "만는"],
      ["꽃망울", "꼰망울"],
      ["붙는", "분는"],
      ["놓는", "논는"],
      ["쌓네", "싼네"],
    ];

    for (const [input, expected] of testCases) {
      it(`should nasalize "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("5. Liquid Nasalization & Mutual Assimilation (ㄹ의 비음화 & 상호 비음화)", () => {
    const testCases: [string, string][] = [
      ["종로", "종노"],
      ["강릉", "강능"],
      ["대통령", "대통녕"],
      ["침략", "침냑"],
      ["남루", "남누"],
      ["국립", "궁닙"],
      ["독립", "동닙"],
      ["백로", "뱅노"],
      ["막론", "망논"],
      ["격리", "경니"],
      ["협력", "혐녁"],
      ["압력", "암녁"],
      ["급류", "금뉴"],
      ["십리", "심니"],
    ];

    for (const [input, expected] of testCases) {
      it(`should assimilate liquid ㄹ on "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("6. Lateralization (유음화: ㄴ+ㄹ -> ㄹㄹ, ㄹ+ㄴ -> ㄹㄹ)", () => {
    const testCases: [string, string][] = [
      ["신라", "실라"],
      ["난로", "날로"],
      ["천리", "철리"],
      ["광안리", "광알리"],
      ["연락", "열락"],
      ["칼날", "칼랄"],
      ["설날", "설랄"],
      ["달나라", "달라라"],
      ["물난리", "물랄리"],
      ["줄넘기", "줄럼기"],
      ["핥는", "할른"],
      ["앓는", "알른"],
    ];

    for (const [input, expected] of testCases) {
      it(`should lateralize "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("7. Tensification / Glottalization (경음화 / 된소리되기)", () => {
    const testCases: [string, string][] = [
      ["국밥", "국빱"],
      ["학교", "학꾜"],
      ["꺾다", "꺽따"],
      ["책상", "책쌍"],
      ["옷고름", "옫꼬름"],
      ["있다", "읻따"],
      ["닫다", "닫따"],
      ["젖소", "젇쏘"],
      ["꽃밭", "꼳빧"],
      ["잡지", "잡찌"],
      ["옆집", "엽찝"],
      ["닭장", "닥짱"],
      ["값도", "갑또"],
      ["읊조리다", "읍쪼리다"],
      // Special ㄺ before ㄱ -> ㄹ + ㄲ
      ["맑게", "말께"],
      ["읽고", "일꼬"],
      ["붉고", "불꼬"],
      ["늙지", "늑찌"],
      // Predicate stem tensification after ㄴ, ㄵ, ㅁ, ㄻ (제24항, 제25항)
      ["신다", "신따"],
      ["신고", "신꼬"],
      ["신지", "신찌"],
      ["앉다", "안따"],
      ["앉고", "안꼬"],
      ["젊다", "점따"],
      ["삼다", "삼따"],
      ["안다", "안따"],
      ["닮다", "담따"],
      ["품고", "품꼬"],
      ["숨다", "숨따"],
      // Sino-Korean ㄹ tensification (표준 발음법 제26항)
      ["갈등", "갈뜽"],
      ["갈증", "갈쯩"],
      ["결정", "결쩡"],
      ["발전", "발쩐"],
      ["물질", "물찔"],
      ["실수", "실쑤"],
      ["활동", "활똥"],
      ["열정", "열쩡"],
      ["발달", "발딸"],
      ["절도", "절또"],
      ["출석", "출썩"],
      ["출세", "출쎄"],
      ["출동", "출똥"],
      ["필승", "필씅"],
      ["철저", "철쩌"],
      ["설득", "설뜩"],
      ["질서", "질써"],
      // Native words with ㄹ coda should NOT tensify
      ["알다", "알다"],
      ["살다", "살다"],
      ["달다", "달다"],
      // Sino-Korean ㄱ, ㅂ after ㄹ should NOT tensify
      ["결과", "결과"],
      ["출발", "출발"],
    ];

    for (const [input, expected] of testCases) {
      it(`should tensify "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("8. Coda Simplification & Neutralization (자음군 단순화 & 음절 끝소리 규칙)", () => {
    const testCases: [string, string][] = [
      ["닭", "닥"],
      ["흙", "흑"],
      ["값", "갑"],
      ["삶", "삼"],
      ["여덟", "여덜"],
      ["몫", "목"],
      ["앉", "안"],
      ["핥", "할"],
      ["읊", "읍"],
      ["옷", "옫"],
      ["꽃", "꼳"],
      ["빛", "빋"],
      ["숲", "숩"],
      ["부엌", "부억"],
      ["히읗", "히읃"],
    ];

    for (const [input, expected] of testCases) {
      it(`should neutralize coda on "${input}" -> "${expected}"`, () => {
        assert.equal(koreanToPronunciation(input), expected);
      });
    }
  });

  describe("9. Hangul Decomposition & Composition helpers", () => {
    it("should decompose and compose Hangul correctly", () => {
      const char = "한";
      const decomposed = decomposeHangul(char);
      assert.ok(decomposed);
      assert.equal(decomposed.cho, "ㅎ");
      assert.equal(decomposed.jung, "ㅏ");
      assert.equal(decomposed.jong, "ㄴ");

      const composed = composeHangul(decomposed.choIdx, decomposed.jungIdx, decomposed.jongIdx);
      assert.equal(composed, "한");
    });

    it("should return null for non-Hangul characters", () => {
      assert.equal(decomposeHangul("A"), null);
      assert.equal(decomposeHangul("1"), null);
      assert.equal(decomposeHangul(" "), null);
    });

    it("should preserve non-Hangul in syllable tokens", () => {
      const tokens: SyllableToken[] = [
        { char: "!", isRaw: true },
        { char: " ", isRaw: true },
      ];
      assert.equal(syllablesToHangul(tokens), "! ");
    });
  });
});
