// Korean Hangul Grapheme & IPA Phonology Engine for Kokoro TTS WebAssembly

const CHO_LIST = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JUNG_LIST = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const JONG_LIST = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

// Pure IPA Phonetic mappings (avoids English diphthongization & preserves Korean monophthongs)
const CHO_IPA = ["k", "k͈", "n", "t", "t͈", "ɾ", "m", "p", "p͈", "s", "s͈", "", "t͡ɕ", "t͡ɕ͈", "t͡ɕʰ", "kʰ", "tʰ", "pʰ", "h"];
const JUNG_IPA = ["a", "ɛ", "ja", "jɛ", "ʌ", "e", "jʌ", "je", "o", "wa", "wɛ", "we", "jo", "u", "wʌ", "we", "ɥi", "ju", "ɯ", "ɰi", "i"];
const JONG_IPA = ["", "k̚", "k̚", "k̚", "n", "n", "n", "t̚", "l", "k̚", "m", "l", "l", "l", "p̚", "l", "m", "p̚", "p̚", "t̚", "t̚", "ŋ", "t̚", "t̚", "k̚", "t̚", "p̚", "t̚"];

// Sino-Korean Number mapping
const SINO_DIGITS = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SINO_UNITS = ["", "십", "백", "천"];
const SINO_BIG_UNITS = ["", "만", "억", "조"];

// Pure Korean Numbers for counting hours / units
const PURE_NUMS = ["영", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
const PURE_HOUR = ["영", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"];

export function numberToKorean(numStr, isHour = false) {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return numStr;
  if (isHour && num >= 1 && num <= 12) {
    return PURE_HOUR[num];
  }
  if (num === 0) return "영";

  let result = "";
  const str = String(num);
  const len = str.length;

  const chunks = [];
  for (let i = len; i > 0; i -= 4) {
    chunks.unshift(str.substring(Math.max(0, i - 4), i));
  }

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const chunkVal = parseInt(chunk, 10);
    if (chunkVal === 0) continue;

    let chunkKorean = "";
    const clen = chunk.length;
    for (let i = 0; i < clen; i++) {
      const digit = parseInt(chunk[i], 10);
      const unitIdx = clen - 1 - i;
      if (digit !== 0) {
        if (digit === 1 && unitIdx > 0 && chunkKorean === "" && clen === 2 && chunkVal < 20) {
          chunkKorean += SINO_UNITS[unitIdx];
        } else if (digit === 1 && unitIdx > 0) {
          chunkKorean += SINO_UNITS[unitIdx];
        } else {
          chunkKorean += SINO_DIGITS[digit] + SINO_UNITS[unitIdx];
        }
      }
    }
    const bigUnitIdx = chunks.length - 1 - c;
    result += chunkKorean + SINO_BIG_UNITS[bigUnitIdx] + " ";
  }

  return result.trim();
}

export function normalizeKoreanText(text) {
  let normalized = text.replace(/(\d{1,2})시\s*(\d{1,2})?분?/g, (m, hour, min) => {
    let res = numberToKorean(hour, true) + "시";
    if (min) {
      res += " " + numberToKorean(min, false) + "분";
    }
    return res;
  });

  normalized = normalized.replace(/(\d[\d,]*)(원|년|월|일|개|명|번|살|층)/g, (m, num, unit) => {
    const cleanNum = num.replace(/,/g, "");
    return numberToKorean(cleanNum, false) + unit;
  });

  normalized = normalized.replace(/\b\d+\b/g, (m) => numberToKorean(m, false));

  return normalized;
}

export function decomposeHangul(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  const offset = code - 0xAC00;
  const jongIdx = offset % 28;
  const jungIdx = Math.floor((offset / 28) % 21);
  const choIdx = Math.floor(offset / 28 / 21);
  return {
    char,
    cho: CHO_LIST[choIdx],
    jung: JUNG_LIST[jungIdx],
    jong: JONG_LIST[jongIdx],
    choIdx,
    jungIdx,
    jongIdx,
    code
  };
}

export function applyPhonologicalRules(syllables) {
  const processed = syllables.map((s) => ({ ...s }));

  for (let i = 0; i < processed.length; i++) {
    const cur = processed[i];
    const next = processed[i + 1];

    if (!cur || cur.isRaw || !next || next.isRaw) continue;

    // 1. Palatalization (구개음화): ㄷ/ㅌ + 이/여/유 -> ㅈ/ㅊ
    if ((cur.jong === "ㄷ" || cur.jong === "ㅌ") && next.choIdx === 11 && (next.jung === "ㅣ" || next.jung.startsWith("ㅑ") || next.jung.startsWith("ㅕ"))) {
      if (cur.jong === "ㄷ") {
        next.choIdx = 12;
      } else if (cur.jong === "ㅌ") {
        next.choIdx = 14;
      }
      cur.jongIdx = 0;
      cur.jong = "";
      continue;
    }

    // 2. Aspiration (격음화): ㄱ/ㄷ/ㅂ/ㅈ + ㅎ -> ㅋ/ㅌ/ㅍ/ㅊ
    if (next.choIdx === 18) {
      if (cur.jong === "ㄱ" || cur.jong === "ㄺ") {
        next.choIdx = 15;
        cur.jongIdx = 0;
        cur.jong = "";
      } else if (["ㄷ", "ㅅ", "ㅈ", "ㅊ", "ㅌ"].includes(cur.jong)) {
        next.choIdx = 16;
        cur.jongIdx = 0;
        cur.jong = "";
      } else if (["ㅂ", "ㄿ", "ㅄ"].includes(cur.jong)) {
        next.choIdx = 17;
        cur.jongIdx = 0;
        cur.jong = "";
      } else if (cur.jong === "ㄶ" || cur.jong === "ㅀ") {
        cur.jongIdx = cur.jong === "ㄶ" ? 4 : 8;
      }
      continue;
    }

    // 3. Liaison (연음법칙): 받침 + 모음(ㅇ)
    if (cur.jongIdx > 0 && next.choIdx === 11) {
      const compoundMap = {
        "ㄳ": { keep: 1, move: 9 },
        "ㄵ": { keep: 4, move: 12 },
        "ㄶ": { keep: 4, move: 11 },
        "ㄺ": { keep: 8, move: 0 },
        "ㄻ": { keep: 8, move: 6 },
        "ㄼ": { keep: 8, move: 7 },
        "ㄽ": { keep: 8, move: 9 },
        "ㄾ": { keep: 8, move: 16 },
        "ㄿ": { keep: 8, move: 17 },
        "ㅀ": { keep: 8, move: 11 },
        "ㅄ": { keep: 7, move: 9 },
      };

      if (compoundMap[cur.jong]) {
        const comp = compoundMap[cur.jong];
        cur.jongIdx = comp.keep;
        cur.jong = JONG_LIST[comp.keep];
        next.choIdx = comp.move;
        next.cho = CHO_LIST[comp.move];
      } else {
        const transferredChoIdx = CHO_LIST.indexOf(cur.jong);
        if (transferredChoIdx !== -1) {
          next.choIdx = transferredChoIdx;
          next.cho = CHO_LIST[transferredChoIdx];
          cur.jongIdx = 0;
          cur.jong = "";
        }
      }
      continue;
    }

    // 4. Nasalization (비음화)
    if (next.choIdx === 2 || next.choIdx === 6) {
      if (["ㅂ", "ㅍ", "ㅄ", "ㄿ"].includes(cur.jong)) {
        cur.jongIdx = 16;
        cur.jong = "ㅁ";
      } else if (["ㄷ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ", "ㅎ"].includes(cur.jong)) {
        cur.jongIdx = 4;
        cur.jong = "ㄴ";
      } else if (["ㄱ", "ㄲ", "ㅋ", "ㄳ", "ㄺ"].includes(cur.jong)) {
        cur.jongIdx = 21;
        cur.jong = "ㅇ";
      }
    }

    // 5. Lateralization (유음화)
    if (cur.jong === "ㄴ" && next.choIdx === 5) {
      cur.jongIdx = 8;
      cur.jong = "ㄹ";
    } else if (cur.jong === "ㄹ" && next.choIdx === 2) {
      next.choIdx = 5;
      next.cho = "ㄹ";
    }
  }

  return processed;
}

export function convertKoreanToSpeechText(inputText) {
  const normalized = normalizeKoreanText(inputText);
  let result = "";
  const parts = normalized.split(/(\s+|[.,!?~;:"]+)/);

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part) || /^[.,!?~;:"]+$/.test(part)) {
      result += part;
      continue;
    }

    const rawSyllables = [];
    for (let i = 0; i < part.length; i++) {
      const char = part[i];
      const decomposed = decomposeHangul(char);
      if (decomposed) {
        rawSyllables.push(decomposed);
      } else {
        rawSyllables.push({ char, isRaw: true });
      }
    }

    const assimilated = applyPhonologicalRules(rawSyllables);

    for (let i = 0; i < assimilated.length; i++) {
      const s = assimilated[i];
      if (s.isRaw) {
        result += s.char;
        continue;
      }

      const choStr = CHO_IPA[s.choIdx];
      const jungStr = JUNG_IPA[s.jungIdx];
      const jongStr = JONG_IPA[s.jongIdx];

      result += choStr + jungStr + jongStr;
    }
  }

  return result.trim();
}

// Preset sentence categories for quality testing
export const KOREAN_SENTENCE_PRESETS = [
  {
    category: "Daily Greetings & Basics (일상 인사 및 기본)",
    description: "Everyday conversational greetings and polite introductions.",
    items: [
      {
        id: "g1",
        korean: "안녕하세요, 만나서 정말 반갑습니다.",
        translation: "Hello, it is really nice to meet you.",
        focus: "Standard opening polite phrase & nasalization (반갑습니다 -> ban-gap-seum-ni-da)"
      },
      {
        id: "g2",
        korean: "좋은 아침입니다! 오늘 하루도 행복하게 보내세요.",
        translation: "Good morning! Have a happy day today.",
        focus: "Cheerful intonation and rhythm."
      },
      {
        id: "g3",
        korean: "감사합니다. 안녕히 가세요, 다음에 또 봬요!",
        translation: "Thank you. Goodbye, see you next time!",
        focus: "Polite gratitude and goodbye etiquette."
      }
    ]
  },
  {
    category: "Polite Inquiries & Questions (공손한 질문 및 문의)",
    description: "Testing rising question intonation and honorific endings.",
    items: [
      {
        id: "q1",
        korean: "지금 몇 시인지 알려주실 수 있나요?",
        translation: "Could you please tell me what time it is now?",
        focus: "Question intonation & smooth flow."
      },
      {
        id: "q2",
        korean: "이 근처에 맛있는 식당이 어디에 있나요?",
        translation: "Where is a delicious restaurant near here?",
        focus: "Liaison in 맛있는 [마신는] & location inquiry."
      },
      {
        id: "q3",
        korean: "혹시 도움이 필요하시면 언제든지 말씀해 주세요.",
        translation: "If you need any help, please feel free to let me know anytime.",
        focus: "Polite conditional clause & soft ending."
      }
    ]
  },
  {
    category: "Expressive & Emotional (감정 표현 및 감탄)",
    description: "Testing dynamic expression, emphasis, and feeling.",
    items: [
      {
        id: "e1",
        korean: "정말 대단해요! 진심으로 축하드립니다.",
        translation: "That's truly amazing! Congratulations from the bottom of my heart.",
        focus: "Exclamation emphasis & aspiration in 축하 [추카]."
      },
      {
        id: "e2",
        korean: "오늘 너무 피곤해서 일찍 집에 가서 쉬어야겠어요.",
        translation: "I am so tired today that I should go home early and rest.",
        focus: "Exhaustion nuance and natural conversational pacing."
      },
      {
        id: "e3",
        korean: "와, 생각했던 것보다 훨씬 더 아름답고 멋지네요!",
        translation: "Wow, it is much more beautiful and awesome than I thought!",
        focus: "Surprise particle '와' and comparative stress."
      }
    ]
  },
  {
    category: "Pronunciation & Phonology (발음, 연음 및 잰말놀이)",
    description: "Challenging consonant clusters, rapid syllables, and tongue twisters.",
    items: [
      {
        id: "p1",
        korean: "간장 공장 공장장은 강 공장장이고, 된장 공장 공장장은 공 공장장이다.",
        translation: "The soy sauce factory manager is Manager Kang, and the soybean paste factory manager is Manager Gong.",
        focus: "Classic Korean tongue twister (velar nasal ㅇ and plosive ㄱ repetitions)."
      },
      {
        id: "p2",
        korean: "내가 그린 기린 그림은 잘 그린 기린 그림이고, 네가 그린 기린 그림은 못 그린 기린 그림이다.",
        translation: "The giraffe drawing I drew is a well-drawn giraffe drawing, and the giraffe drawing you drew is a poorly-drawn giraffe drawing.",
        focus: "Liquid ㄹ and vowel transitions (기린 그림)."
      },
      {
        id: "p3",
        korean: "경찰청 쇠창살 외철창살, 검찰청 쇠창살 쌍철창살.",
        translation: "Police agency iron window bars are single bars, prosecutors office iron window bars are double bars.",
        focus: "Affricates (ㅊ/ㅉ/ㅅ) and complex consonant combinations."
      }
    ]
  },
  {
    category: "Numbers, Time & Currency (숫자, 시간, 금액)",
    description: "Testing Sino-Korean and native Korean number conversion.",
    items: [
      {
        id: "n1",
        korean: "오늘은 2026년 8월 15일 오후 3시 30분입니다.",
        translation: "Today is August 15, 2026, at 3:30 PM.",
        focus: "Mixed Sino-Korean dates (년/월/일) and native hour (세시) + Sino minute (삼십분)."
      },
      {
        id: "n2",
        korean: "주문하신 아메리카노 두 잔과 케이크의 총 금액은 24,500원입니다.",
        translation: "The total amount for two Americanos and a cake you ordered is 24,500 KRW.",
        focus: "Native counter (두 잔) and currency (이만사천오백원)."
      }
    ]
  }
];

// Asian / CJK Syllable-timed Voices (Optimized for Asian phonetics)
export const KOKORO_VOICES = [
  // Japanese Voices
  { id: "jf_alpha", group: "Japanese Voices", name: "Alpha (Female / JP)", grade: "A", traits: "🌸 East Asian syllable timing & flat vowel formants", gender: "Female", lang: "ja" },
  { id: "jf_gongitsune", group: "Japanese Voices", name: "Gongitsune (Female / JP)", grade: "A-", traits: "🦊 Crisp, expressive Japanese female", gender: "Female", lang: "ja" },
  { id: "jf_nezumi", group: "Japanese Voices", name: "Nezumi (Female / JP)", grade: "B+", traits: "🐭 Soft, high-register Asian voice", gender: "Female", lang: "ja" },
  { id: "jf_tebukuro", group: "Japanese Voices", name: "Tebukuro (Female / JP)", grade: "B+", traits: "🧤 Gentle, clear Japanese female narrator", gender: "Female", lang: "ja" },
  { id: "jm_kumo", group: "Japanese Voices", name: "Kumo (Male / JP)", grade: "B+", traits: "☁️ Calm, balanced Japanese male voice", gender: "Male", lang: "ja" },

  // Mandarin Voices
  { id: "zf_xiaobei", group: "Mandarin Voices", name: "Xiaobei (Female / ZH)", grade: "A-", traits: "🏮 Clear tonals & crisp consonant articulation", gender: "Female", lang: "zh" },
  { id: "zf_xiaoni", group: "Mandarin Voices", name: "Xiaoni (Female / ZH)", grade: "B+", traits: "✨ Sweet, high-clarity female voice", gender: "Female", lang: "zh" },
  { id: "zf_xiaoxiao", group: "Mandarin Voices", name: "Xiaoxiao (Female / ZH)", grade: "B+", traits: "🎐 Soft and natural Mandarin female voice", gender: "Female", lang: "zh" },
  { id: "zf_xiaoyi", group: "Mandarin Voices", name: "Xiaoyi (Female / ZH)", grade: "B", traits: "🎙️ Steady standard female narration", gender: "Female", lang: "zh" },
  { id: "zm_yunxi", group: "Mandarin Voices", name: "Yunxi (Male / ZH)", grade: "A-", traits: "🎙️ Articulate male narrator", gender: "Male", lang: "zh" },
  { id: "zm_yunjian", group: "Mandarin Voices", name: "Yunjian (Male / ZH)", grade: "B+", traits: "👔 Deep, resonant East Asian male timbre", gender: "Male", lang: "zh" },
  { id: "zm_yunxia", group: "Mandarin Voices", name: "Yunxia (Male / ZH)", grade: "B+", traits: "📻 Clear broadcast style male voice", gender: "Male", lang: "zh" },
  { id: "zm_yunyang", group: "Mandarin Voices", name: "Yunyang (Male / ZH)", grade: "B", traits: "💼 Professional documentary male voice", gender: "Male", lang: "zh" }
];
