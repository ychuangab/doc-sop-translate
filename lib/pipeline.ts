// 翻譯流程：抽段 → 配術語 → 批次翻譯 → QA → 術語定向收尾 → 再 QA → 回寫雙語 DOCX
import { extractSegments, writeBilingual } from "./docx.ts";
import { matchTerms, missingTerms, type Term } from "./glossary.ts";
import { check, levelOf, type Issue, type Level } from "./qa.ts";
import { fixTerms, translateBatch, type Job } from "./translate.ts";

export const BATCH = 20;
export const MAX_SEGMENTS = 200;

export type SegmentResult = {
  id: number;
  source: string;
  translation: string;
  firstPass: string | null; // 經過術語收尾時保留第一輪譯文供對照
  issues: Issue[];
  level: Level;
};

export type Stats = {
  segments: number;
  termHits: number; // 命中術語的次數（段落×術語）
  termOkBefore: number;
  termOkAfter: number;
  fixed: number;
  green: number;
  yellow: number;
  red: number;
};

export type TranslateResult = {
  lang: string;
  hintTerms: boolean;
  segments: SegmentResult[];
  stats: Stats;
  docx: string; // base64
  model: string;
  elapsedMs: number;
};

export type Stage = "extract" | "translate" | "qa" | "fix" | "write";
export type StreamEvent =
  | { type: "stage"; stage: Stage; status: "start" | "done"; detail?: string }
  | { type: "result"; result: TranslateResult }
  | { type: "error"; message: string };

export type Progress = (stage: Stage, status: "start" | "done", detail?: string) => void;

// hintTerms=false 是對照組：第一輪不把術語放進提示詞（模擬一般機器翻譯），由 QA 與收尾補救
export async function run(
  buf: Uint8Array,
  lang: string,
  terms: Term[],
  progress: Progress,
  hintTerms = true,
): Promise<TranslateResult> {
  const started = Date.now();
  const models = new Set<string>();

  progress("extract", "start");
  const segs = await extractSegments(buf);
  if (segs.length === 0) throw new Error("文件裡沒有中文段落");
  if (segs.length > MAX_SEGMENTS) throw new Error(`段落超過 ${MAX_SEGMENTS} 段，線上展示版只收短文件`);
  const jobs: Job[] = segs.map((s) => ({ ...s, terms: matchTerms(s.text, terms) }));
  const termHits = jobs.reduce((n, j) => n + j.terms.length, 0);
  progress("extract", "done", `${segs.length} 段，命中術語 ${termHits} 次`);

  progress("translate", "start");
  const out = new Map<number, string>();
  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += BATCH) batches.push(jobs.slice(i, i + BATCH));
  await Promise.all(
    batches.map(async (b) => {
      const { items, model } = await translateBatch(hintTerms ? b : b.map((j) => ({ ...j, terms: [] })), lang);
      models.add(model);
      items.forEach((v, k) => out.set(k, v));
    }),
  );
  // 模型漏回的段落單獨補翻一次
  const lost = jobs.filter((j) => !out.get(j.id));
  if (lost.length) {
    const { items, model } = await translateBatch(lost, lang);
    models.add(model);
    items.forEach((v, k) => out.set(k, v));
  }
  progress("translate", "done", `${BATCH} 段一批，共 ${batches.length} 批`);

  progress("qa", "start");
  const termOk = () => jobs.reduce((n, j) => n + j.terms.length - missingTerms(j.text, out.get(j.id) ?? "", j.terms).length, 0);
  const termOkBefore = termOk();
  const needFix = jobs
    .map((j) => ({ id: j.id, source: j.text, translation: out.get(j.id) ?? "", fix: missingTerms(j.text, out.get(j.id) ?? "", j.terms) }))
    .filter((f) => f.fix.length && f.translation);
  progress("qa", "done", `術語遵從 ${termOkBefore}/${termHits}，${needFix.length} 段需收尾`);

  const firstPass = new Map<number, string>();
  progress("fix", "start");
  if (needFix.length) {
    const { items, model } = await fixTerms(needFix, lang);
    models.add(model);
    for (const f of needFix) {
      const fixed = items.get(f.id);
      // 收尾後若引入新的紅燈（例如數值被改掉），保留原譯文
      if (fixed && levelOf(check(f.source, fixed, terms, lang)) !== "red") {
        firstPass.set(f.id, f.translation);
        out.set(f.id, fixed);
      }
    }
  }
  const termOkAfter = termOk();
  progress("fix", "done", needFix.length ? `修正 ${firstPass.size} 段，術語遵從 ${termOkAfter}/${termHits}` : "不需收尾");

  progress("write", "start");
  const segments: SegmentResult[] = jobs.map((j) => {
    const translation = out.get(j.id) ?? "";
    const issues = check(j.text, translation, j.terms, lang);
    return { id: j.id, source: j.text, translation, firstPass: firstPass.get(j.id) ?? null, issues, level: levelOf(issues) };
  });
  const docx = await writeBilingual(buf, new Map(segments.filter((s) => s.translation).map((s) => [s.id, s.translation])));
  progress("write", "done");

  const count = (l: Level) => segments.filter((s) => s.level === l).length;
  return {
    lang,
    hintTerms,
    segments,
    stats: {
      segments: segments.length,
      termHits,
      termOkBefore,
      termOkAfter,
      fixed: firstPass.size,
      green: count("green"),
      yellow: count("yellow"),
      red: count("red"),
    },
    docx: Buffer.from(docx).toString("base64"),
    model: [...models].join("、"),
    elapsedMs: Date.now() - started,
  };
}
