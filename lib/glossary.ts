// 術語比對與遵從性檢查。
// 比對採最長匹配、不重疊：「點檢表」不會同時被算成「點檢」，「螺旋式空壓機」不會再命中「空壓機」。
export type Term = { zh: string; target: string };

export function parseGlossary(text: string): Term[] {
  return text
    .split("\n")
    .map((line) => line.split(/[=＝]/))
    .filter((p) => p.length >= 2 && p[0].trim() && p[1].trim())
    .map(([zh, ...rest]) => ({ zh: zh.trim(), target: rest.join("=").trim() }));
}

export function matchTerms(source: string, terms: Term[]): Term[] {
  const sorted = [...terms].sort((a, b) => b.zh.length - a.zh.length);
  const taken = new Array(source.length).fill(false);
  const hits: Term[] = [];
  for (const t of sorted) {
    let from = 0;
    for (;;) {
      const i = source.indexOf(t.zh, from);
      if (i < 0) break;
      const span = taken.slice(i, i + t.zh.length);
      if (!span.some(Boolean)) {
        span.forEach((_, k) => (taken[i + k] = true));
        if (!hits.includes(t)) hits.push(t);
      }
      from = i + 1;
    }
  }
  return hits;
}

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase();

// 遵從性：原文命中術語，譯文就必須出現指定譯法（不分大小寫）。
// 比「已知錯詞沒有再出現」嚴格：沒見過的同義詞、整個漏譯都抓得到。
export function missingTerms(source: string, translation: string, terms: Term[]): Term[] {
  const tgt = norm(translation);
  return matchTerms(source, terms).filter((t) => !tgt.includes(norm(t.target)));
}
