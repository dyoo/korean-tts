// Korean Hangul Grapheme & IPA Phonology Engine for Kokoro TTS WebAssembly

export interface DecomposedHangul {
  char: string;
  cho: string;
  jung: string;
  jong: string;
  choIdx: number;
  jungIdx: number;
  jongIdx: number;
  code: number;
  isRaw?: false;
}

export interface RawCharacter {
  char: string;
  isRaw: true;
}

export type SyllableToken = DecomposedHangul | RawCharacter;

export interface SentenceItem {
  id: string;
  korean: string;
  translation: string;
  focus: string;
}

export interface SentenceCategory {
  category: string;
  description: string;
  items: SentenceItem[];
}

export interface VoiceConfig {
  id: string;
  group: string;
  name: string;
  grade: string;
  traits: string;
  gender: "Female" | "Male";
  lang: string;
}

export const CHO_LIST: readonly string[] = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export const JUNG_LIST: readonly string[] = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
export const JONG_LIST: readonly string[] = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

// Pure IPA Phonetic mappings (avoids English diphthongization & preserves Korean monophthongs)
export const CHO_IPA: readonly string[] = ["k", "k͈", "n", "t", "t͈", "ɾ", "m", "p", "p͈", "s", "s͈", "", "ʨ", "ʨ͈", "ʨʰ", "kʰ", "tʰ", "pʰ", "h"];
export const JUNG_IPA: readonly string[] = ["a", "ɛ", "ja", "jɛ", "ʌ", "e", "jʌ", "je", "o", "wa", "wɛ", "we", "jo", "u", "wʌ", "we", "ɥi", "ju", "ɯ", "ɰi", "i"];
export const JONG_IPA: readonly string[] = ["", "k̚", "k̚", "k̚", "n", "n", "n", "t̚", "l", "k̚", "m", "l", "l", "l", "p̚", "l", "m", "p̚", "p̚", "t̚", "t̚", "ŋ", "t̚", "t̚", "k̚", "t̚", "p̚", "t̚"];

// Sino-Korean Number mapping
const SINO_DIGITS: readonly string[] = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SINO_UNITS: readonly string[] = ["", "십", "백", "천"];
const SINO_BIG_UNITS: readonly string[] = ["", "만", "억", "조"];

// Pure Korean Numbers for counting hours / units (1-99)
const NATIVE_TENS: readonly string[] = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];
const NATIVE_ONES: readonly string[] = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"];
const NATIVE_ATTR_ONES: readonly string[] = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];

// English alphabet transliteration map for mixed Korean-English text / acronyms
const ENG_LETTER_MAP: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지",
  h: "에이치", i: "아이", j: "제이", k: "케이", l: "엘", m: "엠", n: "엔",
  o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유",
  v: "브이", w: "더블유", x: "엑스", y: "와이", z: "제트"
};

/**
 * Converts a number to Native Korean (순우리말 수사).
 * @param num Number from 1 to 99
 * @param isAttributive If true, uses attributive form before nouns (한, 두, 세, 네, 스무)
 */
export function numberToNativeKorean(num: number, isAttributive: boolean = true): string {
  if (num === 0) return "영";
  if (num < 1 || num > 99) return numberToKorean(String(num));

  if (num === 20 && isAttributive) return "스무";

  const tens = Math.floor(num / 10);
  const ones = num % 10;

  if (tens === 0) {
    return isAttributive ? NATIVE_ATTR_ONES[ones] : NATIVE_ONES[ones];
  }

  const tensStr = NATIVE_TENS[tens];
  if (ones === 0) {
    return tensStr;
  }

  const onesStr = isAttributive ? NATIVE_ATTR_ONES[ones] : NATIVE_ONES[ones];
  return tensStr + onesStr;
}

/**
 * Converts a Sino-Korean number string to Hangul.
 */
export function numberToKorean(numStr: string, isHour: boolean = false): string {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return numStr;
  if (isHour && num >= 1 && num <= 12) {
    return numberToNativeKorean(num, true);
  }
  if (num === 0) return "영";

  let result = "";
  const str = String(num);
  const len = str.length;

  const chunks: string[] = [];
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

/**
 * Normalizes Korean text: numbers, dates, times, decimals, percentages, phone numbers, units, currency, and English acronyms.
 */
export function normalizeKoreanText(text: string): string {
  let normalized = text;

  // 1. Percentages (e.g. 50% -> 50 퍼센트, 99.9% -> 99.9 퍼센트)
  normalized = normalized.replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 퍼센트");

  // 2. Decimals (e.g. 3.14 -> 삼 점 일사)
  normalized = normalized.replace(/(\d+)\.(\d+)/g, (_m, intPart, decPart) => {
    const intKorean = numberToKorean(intPart, false);
    const decDigits = Array.from(decPart).map((d) => SINO_DIGITS[parseInt(d as string, 10)]).join("");
    return `${intKorean} 점 ${decDigits}`;
  });

  // 3. Phone numbers with hyphens (e.g. 010-1234-5678 -> 공일공 일이삼사 오육칠팔)
  normalized = normalized.replace(/\b0(\d{1,2})-(\d{3,4})-(\d{4})\b/g, (_m, p1, p2, p3) => {
    const toDigits = (str: string) => Array.from(str).map((c) => (c === "0" ? "공" : SINO_DIGITS[parseInt(c, 10)])).join("");
    return `${toDigits("0" + p1)} ${toDigits(p2)} ${toDigits(p3)}`;
  });

  // 4. Ordinal '번째' (e.g. 1번째 -> 첫 번째, 2번째 -> 두 번째, 3번째 -> 세 번째)
  normalized = normalized.replace(/(\d{1,2})\s*번째/g, (_m, numStr) => {
    const n = parseInt(numStr, 10);
    if (n === 1) return "첫 번째";
    if (n >= 2 && n <= 9) return NATIVE_ATTR_ONES[n] + " 번째";
    if (n >= 10 && n <= 99) return numberToNativeKorean(n, true) + " 번째";
    return numStr + " 번째";
  });

  // 5. Hours & Minutes (e.g. 3시 30분, 12시 5분)
  normalized = normalized.replace(/(\d{1,2})시\s*(\d{1,2})?분?/g, (_m, hour, min) => {
    let res = numberToKorean(hour, true) + "시";
    if (min) {
      res += " " + numberToKorean(min, false) + "분";
    }
    return res;
  });

  // 6. Native Korean Counting Units (1-99 before counting nouns)
  // e.g. 1개 -> 한 개, 2명 -> 두 명, 3살 -> 세 살, 4마리 -> 네 마리, 20살 -> 스무 살
  const nativeUnitPattern = /(\d{1,2})\s*(개|명|살|마리|잔|채|대|권|장|그루|송이|자루|켤레|통|벌|군데|가지|번|병|그릇|박스|팩|세트)/g;
  normalized = normalized.replace(nativeUnitPattern, (_m, numStr, unit) => {
    const n = parseInt(numStr, 10);
    if (n >= 1 && n <= 99) {
      return numberToNativeKorean(n, true) + " " + unit;
    }
    return numberToKorean(numStr, false) + " " + unit;
  });

  // 7. Sino-Korean units & currency (e.g. 24,500원, 2026년, 8월, 15일, 3층, 10호)
  normalized = normalized.replace(/(\d[\d,]*)\s*(원|년|월|일|층|호|점|등|도|미터|킬로미터|센티미터|밀리미터|그램|킬로그램|리터|밀리리터)/g, (_m, num, unit) => {
    const cleanNum = num.replace(/,/g, "");
    return numberToKorean(cleanNum, false) + unit;
  });

  // 8. Standalone numbers
  normalized = normalized.replace(/\b\d+\b/g, (m) => numberToKorean(m, false));

  // 9. English letters / acronyms transliteration (e.g. "AI" -> "에이아이", "TTS" -> "티티에스")
  normalized = normalized.replace(/\b[A-Za-z]+\b/g, (match) => {
    return Array.from(match.toLowerCase())
      .map((c) => ENG_LETTER_MAP[c] || c)
      .join("");
  });

  return normalized;
}

/**
 * Decomposes a Hangul character into its constituent Cho, Jung, and Jong components.
 */
export function decomposeHangul(char: string): DecomposedHangul | null {
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
    code,
    isRaw: false
  };
}

/**
 * Composes Cho, Jung, and Jong index values into a Unicode Hangul character.
 */
export function composeHangul(choIdx: number, jungIdx: number, jongIdx: number = 0): string {
  if (choIdx < 0 || choIdx >= 19 || jungIdx < 0 || jungIdx >= 21 || jongIdx < 0 || jongIdx >= 28) {
    return "";
  }
  return String.fromCharCode(0xAC00 + (choIdx * 21 + jungIdx) * 28 + jongIdx);
}

/**
 * Reconstructs a Hangul string from a list of SyllableTokens.
 */
export function syllablesToHangul(syllables: SyllableToken[]): string {
  return syllables
    .map((s) => (s.isRaw ? s.char : composeHangul(s.choIdx, s.jungIdx, s.jongIdx)))
    .join("");
}

/**
 * Applies Standard Korean Phonological Rules (표준 발음법) across syllable boundaries:
 * 1. Palatalization (구개음화: ㄷ/ㅌ/ㄾ + 이/반모음 [j] -> ㅈ/ㅊ, ㄷ + 히 -> ㅊ)
 * 2. Aspiration (격음화: 평음 + ㅎ -> 격음, ㅎ/ㄶ/ㅀ + 평음 -> 격음/경음)
 * 3. Liaison & ㅎ-Elision (연음법칙 & ㅎ 탈락)
 * 4. Lateralization & Liquid Nasalization (유음화 & ㄹ의 비음화)
 * 5. Nasalization before ㄴ/ㅁ (비음화)
 * 6. Tensification / Glottalization (경음화 / 된소리되기)
 * 7. Coda Simplification & Neutralization (자음군 단순화 & 음절의 끝소리 규칙)
 */
export function applyPhonologicalRules(syllables: SyllableToken[]): SyllableToken[] {
  const processed: SyllableToken[] = syllables.map((s) => ({ ...s }));

  for (let i = 0; i < processed.length; i++) {
    const cur = processed[i];
    const next = processed[i + 1];

    if (!cur || cur.isRaw) continue;

    // 1. Palatalization (구개음화): ㄷ/ㅌ/ㄾ + 이/반모음 [j] -> ㅈ/ㅊ, ㄷ + 히 -> ㅊ
    if (next && !next.isRaw) {
      const isIorY = next.jung === "ㅣ" || ["ㅑ", "ㅒ", "ㅕ", "ㅖ", "ㅛ", "ㅠ"].includes(next.jung);
      if (next.choIdx === 11 && isIorY) {
        if (cur.jong === "ㄷ") {
          next.choIdx = 12; // ㅈ
          next.cho = "ㅈ";
          cur.jongIdx = 0;
          cur.jong = "";
          continue;
        } else if (cur.jong === "ㅌ") {
          next.choIdx = 14; // ㅊ
          next.cho = "ㅊ";
          cur.jongIdx = 0;
          cur.jong = "";
          continue;
        } else if (cur.jong === "ㄾ") {
          next.choIdx = 14; // ㅊ
          next.cho = "ㅊ";
          cur.jongIdx = 8;
          cur.jong = "ㄹ";
          continue;
        }
      } else if (cur.jong === "ㄷ" && next.choIdx === 18 && next.jung === "ㅣ") { // 닫히다 -> [다치다], 묻히다 -> [무치다]
        next.choIdx = 14; // ㅊ
        next.cho = "ㅊ";
        cur.jongIdx = 0;
        cur.jong = "";
        continue;
      }
    }

    // 2. Aspiration: Coda + ㅎ (평음 + ㅎ -> 격음)
    if (next && !next.isRaw && next.choIdx === 18) {
      if (["ㄱ", "ㄲ", "ㅋ", "ㄳ"].includes(cur.jong)) {
        next.choIdx = 15; // ㅋ
        next.cho = "ㅋ";
        cur.jongIdx = 0;
        cur.jong = "";
        continue;
      } else if (cur.jong === "ㄺ") {
        next.choIdx = 15; // ㅋ
        next.cho = "ㅋ";
        cur.jongIdx = 8;
        cur.jong = "ㄹ";
        continue;
      } else if (["ㄷ", "ㅅ", "ㅆ", "ㅌ"].includes(cur.jong)) {
        next.choIdx = 16; // ㅌ
        next.cho = "ㅌ";
        cur.jongIdx = 0;
        cur.jong = "";
        continue;
      } else if (["ㅈ", "ㅊ"].includes(cur.jong)) {
        next.choIdx = 14; // ㅊ
        next.cho = "ㅊ";
        cur.jongIdx = 0;
        cur.jong = "";
        continue;
      } else if (cur.jong === "ㄵ") {
        next.choIdx = 14; // ㅊ
        next.cho = "ㅊ";
        cur.jongIdx = 4;
        cur.jong = "ㄴ";
        continue;
      } else if (["ㅂ", "ㅍ", "ㅄ"].includes(cur.jong)) {
        next.choIdx = 17; // ㅍ
        next.cho = "ㅍ";
        cur.jongIdx = 0;
        cur.jong = "";
        continue;
      } else if (cur.jong === "ㄿ" || cur.jong === "ㄼ") {
        next.choIdx = 17; // ㅍ
        next.cho = "ㅍ";
        cur.jongIdx = 8;
        cur.jong = "ㄹ";
        continue;
      }
    }

    // 3. Aspiration / Interaction with ㅎ/ㄶ/ㅀ coda + onset
    if (["ㅎ", "ㄶ", "ㅀ"].includes(cur.jong)) {
      if (next && !next.isRaw) {
        const oldJong = cur.jong;
        const reduceH = () => {
          if (oldJong === "ㅎ") {
            cur.jong = "";
            cur.jongIdx = 0;
          } else if (oldJong === "ㄶ") {
            cur.jong = "ㄴ";
            cur.jongIdx = 4;
          } else if (oldJong === "ㅀ") {
            cur.jong = "ㄹ";
            cur.jongIdx = 8;
          }
        };

        if (next.choIdx === 0) { // ㄱ -> ㅋ
          next.choIdx = 15;
          next.cho = "ㅋ";
          reduceH();
          continue;
        } else if (next.choIdx === 3) { // ㄷ -> ㅌ
          next.choIdx = 16;
          next.cho = "ㅌ";
          reduceH();
          continue;
        } else if (next.choIdx === 12) { // ㅈ -> ㅊ
          next.choIdx = 14;
          next.cho = "ㅊ";
          reduceH();
          continue;
        } else if (next.choIdx === 9) { // ㅅ -> ㅆ
          next.choIdx = 10;
          next.cho = "ㅆ";
          reduceH();
          continue;
        } else if (next.choIdx === 2) { // ㄴ
          if (oldJong === "ㅎ") {
            cur.jong = "ㄴ";
            cur.jongIdx = 4;
          } else if (oldJong === "ㄶ") {
            cur.jong = "ㄴ";
            cur.jongIdx = 4;
          } else if (oldJong === "ㅀ") {
            cur.jong = "ㄹ";
            cur.jongIdx = 8;
            next.cho = "ㄹ";
            next.choIdx = 5;
          }
          continue;
        } else if (next.choIdx === 11) { // ㅇ (vowel) -> ㅎ drops / moves
          if (oldJong === "ㅎ") {
            cur.jong = "";
            cur.jongIdx = 0;
          } else if (oldJong === "ㄶ") {
            cur.jong = "";
            cur.jongIdx = 0;
            next.cho = "ㄴ";
            next.choIdx = 2;
          } else if (oldJong === "ㅀ") {
            cur.jong = "";
            cur.jongIdx = 0;
            next.cho = "ㄹ";
            next.choIdx = 5;
          }
          continue;
        }
      }
    }

    // 4. Liaison (연음법칙)
    if (cur.jongIdx > 0 && next && !next.isRaw && next.choIdx === 11) {
      if (cur.jong === "ㅇ") {
        // Coda ㅇ stays ŋ
        continue;
      }
      const compoundMap: Record<string, { keep: number; move: number }> = {
        "ㄳ": { keep: 1, move: 10 }, // ㅆ
        "ㄵ": { keep: 4, move: 12 }, // ㅈ
        "ㄺ": { keep: 8, move: 0 },  // ㄱ
        "ㄻ": { keep: 8, move: 6 },  // ㅁ
        "ㄼ": { keep: 8, move: 7 },  // ㅂ
        "ㄽ": { keep: 8, move: 10 }, // ㅆ
        "ㄾ": { keep: 8, move: 16 }, // ㅌ
        "ㄿ": { keep: 8, move: 17 }, // ㅍ
        "ㅄ": { keep: 17, move: 10 }, // ㅆ
      };

      if (compoundMap[cur.jong]) {
        const comp = compoundMap[cur.jong];
        cur.jongIdx = comp.keep;
        cur.jong = JONG_LIST[comp.keep];
        next.choIdx = comp.move;
        next.cho = CHO_LIST[comp.move];
      } else {
        if (cur.jong === "ㅅ") {
          next.choIdx = 9;
          next.cho = "ㅅ";
        } else if (cur.jong === "ㅆ") {
          next.choIdx = 10;
          next.cho = "ㅆ";
        } else {
          const transferredChoIdx = CHO_LIST.indexOf(cur.jong);
          if (transferredChoIdx !== -1) {
            next.choIdx = transferredChoIdx;
            next.cho = CHO_LIST[transferredChoIdx];
          }
        }
        cur.jongIdx = 0;
        cur.jong = "";
      }
      continue;
    }

    // 5. Lateralization & Nasalization of ㄹ (유음화 및 ㄹ의 비음화)
    if (next && !next.isRaw && next.choIdx === 5) { // next is ㄹ
      if (cur.jong === "ㄴ") { // ㄴ + ㄹ -> ㄹ + ㄹ
        cur.jong = "ㄹ";
        cur.jongIdx = 8;
        continue;
      } else if (["ㅁ", "ㅇ"].includes(cur.jong)) { // ㅁ/ㅇ + ㄹ -> ㅁ/ㅇ + ㄴ
        next.cho = "ㄴ";
        next.choIdx = 2;
        continue;
      } else if (["ㄱ", "ㄲ", "ㅋ", "ㄳ", "ㄺ"].includes(cur.jong)) {
        cur.jong = "ㅇ";
        cur.jongIdx = 21;
        next.cho = "ㄴ";
        next.choIdx = 2;
        continue;
      } else if (["ㅂ", "ㅍ", "ㄿ", "ㅄ"].includes(cur.jong)) {
        cur.jong = "ㅁ";
        cur.jongIdx = 16;
        next.cho = "ㄴ";
        next.choIdx = 2;
        continue;
      } else if (["ㄷ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ", "ㅎ"].includes(cur.jong)) {
        cur.jong = "ㄴ";
        cur.jongIdx = 4;
        next.cho = "ㄴ";
        next.choIdx = 2;
        continue;
      }
    } else if (next && !next.isRaw && next.choIdx === 2 && ["ㄹ", "ㄾ", "ㅀ"].includes(cur.jong)) { // ㄹ + ㄴ -> ㄹ + ㄹ
      cur.jong = "ㄹ";
      cur.jongIdx = 8;
      next.cho = "ㄹ";
      next.choIdx = 5;
      continue;
    }

    // 6. Nasalization before ㄴ / ㅁ (비음화)
    if (next && !next.isRaw && (next.choIdx === 2 || next.choIdx === 6)) {
      if (["ㅂ", "ㅍ", "ㅄ", "ㄿ", "ㄼ"].includes(cur.jong)) {
        cur.jongIdx = 16;
        cur.jong = "ㅁ";
        continue;
      } else if (["ㄷ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ", "ㅎ"].includes(cur.jong)) {
        cur.jongIdx = 4;
        cur.jong = "ㄴ";
        continue;
      } else if (["ㄱ", "ㄲ", "ㅋ", "ㄳ", "ㄺ"].includes(cur.jong)) {
        cur.jongIdx = 21;
        cur.jong = "ㅇ";
        continue;
      }
    }

    // 7. Tensification (경음화 / 된소리되기)
    // 7a. Special ㄺ + ㄱ -> ㄹ + ㄲ
    if (cur.jong === "ㄺ" && next && !next.isRaw && next.choIdx === 0) {
      cur.jong = "ㄹ";
      cur.jongIdx = 8;
      next.cho = "ㄲ";
      next.choIdx = 1;
      continue;
    }

    // 7b. Post-Obstruent Tensification
    const obstruents = ["ㄱ", "ㄲ", "ㅋ", "ㄳ", "ㄺ", "ㄷ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ", "ㅂ", "ㅍ", "ㄿ", "ㅄ"];
    if (obstruents.includes(cur.jong) && next && !next.isRaw) {
      if (next.choIdx === 0) { // ㄱ -> ㄲ
        next.cho = "ㄲ";
        next.choIdx = 1;
      } else if (next.choIdx === 3) { // ㄷ -> ㄸ
        next.cho = "ㄸ";
        next.choIdx = 4;
      } else if (next.choIdx === 7) { // ㅂ -> ㅃ
        next.cho = "ㅃ";
        next.choIdx = 8;
      } else if (next.choIdx === 9) { // ㅅ -> ㅆ
        next.cho = "ㅆ";
        next.choIdx = 10;
      } else if (next.choIdx === 12) { // ㅈ -> ㅉ
        next.cho = "ㅉ";
        next.choIdx = 13;
      }
    }

    // 7c. Predicate stem tensification after ㄴ, ㄵ, ㅁ, ㄻ (어간 받침 뒤 경음화: 표준 발음법 제24항, 제25항)
    const PREDICATE_STEMS_N_M = ["신", "앉", "젊", "삼", "안", "닮", "얹", "품", "숨", "감", "참", "굶", "넘", "더듬"];
    const VERB_ENDINGS = ["다", "고", "지", "게", "소", "자", "든", "록"];
    if (
      ["ㄴ", "ㄵ", "ㅁ", "ㄻ"].includes(cur.jong) &&
      PREDICATE_STEMS_N_M.includes(cur.char) &&
      next &&
      !next.isRaw &&
      VERB_ENDINGS.includes(next.char)
    ) {
      if (next.choIdx === 3) { // ㄷ -> ㄸ
        next.cho = "ㄸ";
        next.choIdx = 4;
      } else if (next.choIdx === 0) { // ㄱ -> ㄲ
        next.cho = "ㄲ";
        next.choIdx = 1;
      } else if (next.choIdx === 12) { // ㅈ -> ㅉ
        next.cho = "ㅉ";
        next.choIdx = 13;
      } else if (next.choIdx === 9) { // ㅅ -> ㅆ
        next.cho = "ㅆ";
        next.choIdx = 10;
      }
    }

    // 7d. Sino-Korean ㄹ Tensification (한자어 'ㄹ' 받침 뒤 경음화: 표준 발음법 제26항)
    // 한자어에서 'ㄹ' 받침 뒤에 연결되는 'ㄷ, ㅅ, ㅈ'은 된소리로 발음한다.
    const SINO_L_ROOTS = new Set([
      "갈", "결", "골", "굴", "궐", "길", "날", "달", "돌", "렬", "류", "률", "말", "멸", "몰", "물",
      "밀", "발", "벌", "불", "살", "설", "솔", "실", "알", "열", "염", "엽", "영", "월", "율",
      "을", "일", "절", "점", "졸", "줄", "질", "찰", "철", "첨", "첩", "촐", "총", "칠", "탈",
      "팔", "필", "학", "할", "활", "혈", "홀", "휼", "훌", "힐", "출"
    ]);

    const SINO_TENSE_ONSETS = new Set([
      // ㄷ
      "등", "단", "도", "달", "동", "득", "대", "덕", "담", "두", "독", "답", "당",
      // ㅅ
      "수", "상", "세", "식", "성", "서", "산", "승", "소", "송", "심", "선", "설", "실", "생", "신", "속", "숙", "손", "시", "사", "석", "술", "습", "순",
      // ㅈ
      "정", "전", "질", "증", "자", "저", "점", "조", "진", "작", "재", "장", "직", "제", "절", "족", "주", "중", "집", "존", "준", "지"
    ]);

    if (
      (cur.jong === "ㄹ" || cur.jongIdx === 8) &&
      SINO_L_ROOTS.has(cur.char) &&
      next &&
      !next.isRaw &&
      SINO_TENSE_ONSETS.has(next.char)
    ) {
      if (next.choIdx === 3) { // ㄷ -> ㄸ
        next.cho = "ㄸ";
        next.choIdx = 4;
      } else if (next.choIdx === 9) { // ㅅ -> ㅆ
        next.cho = "ㅆ";
        next.choIdx = 10;
      } else if (next.choIdx === 12) { // ㅈ -> ㅉ
        next.cho = "ㅉ";
        next.choIdx = 13;
      }
    }
  }

  // Final Pass: Coda simplification & neutralization (자음군 단순화 및 음절 끝소리 규칙)
  for (let i = 0; i < processed.length; i++) {
    const cur = processed[i];
    if (!cur || cur.isRaw || cur.jongIdx === 0) continue;

    if (["ㄳ", "ㄺ", "ㄲ", "ㅋ"].includes(cur.jong)) {
      cur.jong = "ㄱ";
      cur.jongIdx = 1;
    } else if (["ㄵ", "ㄶ"].includes(cur.jong)) {
      cur.jong = "ㄴ";
      cur.jongIdx = 4;
    } else if (["ㄼ", "ㄽ", "ㄾ", "ㅀ"].includes(cur.jong)) {
      cur.jong = "ㄹ";
      cur.jongIdx = 8;
    } else if (cur.jong === "ㄻ") {
      cur.jong = "ㅁ";
      cur.jongIdx = 16;
    } else if (["ㄿ", "ㅄ", "ㅍ"].includes(cur.jong)) {
      cur.jong = "ㅂ";
      cur.jongIdx = 17;
    } else if (["ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ", "ㅎ"].includes(cur.jong)) {
      cur.jong = "ㄷ";
      cur.jongIdx = 7;
    }
  }

  return processed;
}

/**
 * Returns the phonetic Hangul pronunciation of a Korean string according to Standard Korean Phonology.
 * (e.g. "감사합니다" -> "감사함니다", "국밥" -> "국빱", "굳이" -> "구지")
 */
export function koreanToPronunciation(inputText: string): string {
  const normalized = normalizeKoreanText(inputText);
  let result = "";
  const parts = normalized.split(/(\s+|[.,!?~;:"]+)/);

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part) || /^[.,!?~;:"]+$/.test(part)) {
      result += part;
      continue;
    }

    const rawSyllables: SyllableToken[] = [];
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
    result += syllablesToHangul(assimilated);
  }

  return result.trim();
}

/**
 * Converts Korean Hangul text into normalized, phonetically assimilated IPA monophthongs.
 * Features allophonic voicing of plain stops (ɡ, d, b, ʥ), palatalization (ɕ, ɕ͈),
 * and lateral gemination (ll).
 */
export function convertKoreanToSpeechText(inputText: string): string {
  const normalized = normalizeKoreanText(inputText);
  let result = "";
  const parts = normalized.split(/(\s+|[.,!?~;:"]+)/);

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part) || /^[.,!?~;:"]+$/.test(part)) {
      result += part;
      continue;
    }

    const rawSyllables: SyllableToken[] = [];
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

      const prev = i > 0 && !assimilated[i - 1].isRaw ? (assimilated[i - 1] as DecomposedHangul) : null;
      let choStr = CHO_IPA[s.choIdx];
      const isIorY = s.jung === "ㅣ" || ["ㅑ", "ㅒ", "ㅕ", "ㅖ", "ㅛ", "ㅠ", "ㅟ"].includes(s.jung);

      // 1. Palatalization of /s/ and /s͈/ before /i/ or /j/ -> [ɕ, ɕ͈]
      if (s.choIdx === 9 && isIorY) { // ㅅ
        choStr = "ɕ";
      } else if (s.choIdx === 10 && isIorY) { // ㅆ
        choStr = "ɕ͈";
      }

      // 2. Geminate lateral /l/ when preceded by coda /l/
      if (s.choIdx === 5 && prev && (prev.jongIdx === 8 || prev.jong === "ㄹ")) {
        choStr = "l";
      }

      // 3. Intervocalic / Post-sonorant voicing of plain stops (ㄱ, ㄷ, ㅂ, ㅈ)
      const prevIsSonorant = prev && (prev.jongIdx === 0 || [4, 8, 16, 21].includes(prev.jongIdx));
      if (prevIsSonorant) {
        if (s.choIdx === 0) choStr = "ɡ";        // ㄱ -> ɡ
        else if (s.choIdx === 3) choStr = "d";   // ㄷ -> d
        else if (s.choIdx === 7) choStr = "b";   // ㅂ -> b
        else if (s.choIdx === 12) choStr = "ʥ";  // ㅈ -> ʥ
      }

      const jungStr = JUNG_IPA[s.jungIdx];
      const jongStr = JONG_IPA[s.jongIdx];

      result += choStr + jungStr + jongStr;
    }
  }

  return result.trim();
}

export function isHangul(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}

export const koreanToIpa = convertKoreanToSpeechText;

// Preset sentence categories for quality testing
export const KOREAN_SENTENCE_PRESETS: SentenceCategory[] = [
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
export const KOKORO_VOICES: VoiceConfig[] = [
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
