// 本機用範例 SOP 跑完整流程：npm run sample -- en（可換 vi、id、th；加 --no-hint 跑對照組）
import { readFile, writeFile } from "node:fs/promises";
import glossary from "../lib/glossary.json" with { type: "json" };
import { run } from "../lib/pipeline.ts";

const lang = process.argv[2] ?? "en";
const buf = await readFile(new URL("../public/samples/SOP_空壓機日常點檢.docx", import.meta.url));
const terms = (glossary as { [k: string]: string }[]).map((g) => ({ zh: g.zh, target: g[lang] }));
const hint = !process.argv.includes("--no-hint");
const r = await run(new Uint8Array(buf), lang, terms, (stage, status, detail) => status === "done" && console.log(stage, detail ?? ""), hint);
console.log(r.model, `${r.elapsedMs}ms`, r.stats);
for (const s of r.segments.filter((x) => x.level !== "green" || x.firstPass)) {
  console.log(`[${s.level}] ${s.source}\n   → ${s.translation}${s.firstPass ? `\n   (第一輪) ${s.firstPass}` : ""}\n   ${s.issues.map((i) => i.message).join("；")}`);
}
await writeFile(new URL(`../tmp-sample-${lang}.docx`, import.meta.url), Buffer.from(r.docx, "base64"));
