"use client";

import { useState } from "react";
import glossary from "@/lib/glossary.json";
import type { Stage, StreamEvent, TranslateResult } from "@/lib/pipeline.ts";
import { DropZone } from "./components/DropZone.tsx";

const SAMPLE = "SOP_空壓機日常點檢.docx";
const REPO_URL = "https://github.com/ychuangab/doc-sop-translate";
const LANG_OPTIONS: [string, string][] = [["en", "英文"], ["vi", "越南文"], ["id", "印尼文"], ["th", "泰文"]];

const defaultGlossary = (lang: string) =>
  (glossary as { [k: string]: string }[]).map((g) => `${g.zh}=${g[lang]}`).join("\n");

const STEPS: { key: Stage; name: string; desc: string }[] = [
  { key: "extract", name: "抽段配術語", desc: "抽出含中文的段落（含表格），比對術語表" },
  { key: "translate", name: "批次翻譯", desc: "20 段一批，模型只處理文字" },
  { key: "qa", name: "QA 檢查", desc: "術語、數值條號、殘留中文、退化" },
  { key: "fix", name: "術語收尾", desc: "只改不符的術語，其他文字不動" },
  { key: "write", name: "回寫 Word", desc: "每段下方插入綠色譯文，保留版面" },
];
type StepState = Record<Stage, { status: "idle" | "running" | "done"; detail?: string }>;
const idle = (): StepState => Object.fromEntries(STEPS.map((s) => [s.key, { status: "idle" }])) as StepState;

function downloadBase64(name: string, b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState("en");
  const [terms, setTerms] = useState(defaultGlossary("en"));
  const [baseline, setBaseline] = useState(false);
  const [steps, setSteps] = useState<StepState>(idle);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "fixed" | "issue">("all");

  async function run(f: File) {
    setRunning(true);
    setResult(null);
    setError(null);
    setSteps(idle());
    try {
      const body = new FormData();
      body.append("file", f);
      body.append("lang", lang);
      body.append("glossary", terms);
      body.append("hintTerms", String(!baseline));
      const res = await fetch("/api/translate", { method: "POST", body });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `伺服器錯誤 ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StreamEvent;
          if (e.type === "stage") {
            setSteps((p) => ({ ...p, [e.stage]: { status: e.status === "start" ? "running" : "done", detail: e.detail } }));
          } else if (e.type === "result") {
            setResult(e.result);
            setFilter(e.result.stats.fixed > 0 ? "fixed" : "all");
          } else {
            throw new Error(e.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function runSample() {
    const res = await fetch(`/samples/${encodeURIComponent(SAMPLE)}`);
    const f = new File([await res.blob()], SAMPLE);
    setFile(f);
    run(f);
  }

  const st = result?.stats;
  const rows = result?.segments.filter((s) => filter === "all" || (filter === "fixed" ? s.firstPass : s.level !== "green")) ?? [];
  const langName = LANG_OPTIONS.find(([c]) => c === result?.lang)?.[1];

  return (
    <main>
      <h1>SOP 文件翻譯</h1>
      <p className="lead">
        上傳中文 SOP（Word），依術語表翻成目標語言，在每段原文下方插入譯文，產出雙語對照文件。
        翻譯後由程式做 QA：術語不符的段落自動定向修正，數值、條號遺失或殘留中文則標紅燈。
      </p>
      <div className="tags">
        <span className="tag">術語硬鎖</span>
        <span className="tag">QA 紅黃綠燈</span>
        <span className="tag">定向收尾</span>
        <span className="tag">Word XML 回寫</span>
        <span className="tag">Gemini</span>
      </div>

      <section className="card">
        <h2>1. 文件與設定</h2>
        <DropZone role="中文 SOP（DOCX）" file={file} onFile={setFile} disabled={running} />
        <div className="options" style={{ marginTop: 12 }}>
          <div>
            <label className="field">目標語言</label>
            <select value={lang} disabled={running} onChange={(e) => { setLang(e.target.value); setTerms(defaultGlossary(e.target.value)); }}>
              {LANG_OPTIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
            <label className="check-row">
              <input type="checkbox" checked={baseline} disabled={running} onChange={(e) => setBaseline(e.target.checked)} />
              <span>
                對照組：第一輪不提供術語（模擬一般機器翻譯），觀察 QA 抓出術語不一致後如何定向修正。
              </span>
            </label>
          </div>
          <div>
            <label className="field">術語表（每行「中文=譯文」，可自行修改）</label>
            <textarea value={terms} disabled={running} onChange={(e) => setTerms(e.target.value)} spellCheck={false} />
          </div>
        </div>
        <div className="actions">
          <button className="primary" disabled={running || !file} onClick={() => run(file!)}>開始翻譯</button>
          <button disabled={running} onClick={runSample}>用範例 SOP 翻譯</button>
          <span className="small">
            範例：<a href={`/samples/${SAMPLE}`} download>空壓機日常點檢 SOP</a>（虛構，含編號條文與點檢表格）
          </span>
        </div>
        <p className="small" style={{ marginTop: 8 }}>DOCX 1 MB、200 段以內。檔案只用於本次翻譯，不保存。請勿上傳機密文件。</p>
      </section>

      {(running || result || error) && (
        <section className="card">
          <h2>2. 處理流程</h2>
          <div className="steps five">
            {STEPS.map((s, i) => (
              <div key={s.key} className={`step ${steps[s.key].status}`}>
                <div className="no">步驟 {i + 1}</div>
                <div className="name">{s.name}</div>
                <div className="desc">{steps[s.key].detail ?? s.desc}</div>
              </div>
            ))}
          </div>
          {error && <div className="error-box">翻譯失敗：{error}</div>}
        </section>
      )}

      {result && st && (
        <>
          <section className="card">
            <h2>3. 結果：{langName}{result.hintTerms ? "" : "（對照組）"}</h2>
            <div className="summary">
              <div className="stat"><div className="n">{st.segments}</div><div className="l">翻譯段落</div></div>
              <div className="stat">
                <div className="n">{st.termOkBefore}→{st.termOkAfter}<span className="small"> / {st.termHits}</span></div>
                <div className="l">術語遵從（第一輪→收尾後）</div>
              </div>
              <div className="stat"><div className="n">{st.fixed}</div><div className="l">定向修正段落</div></div>
              <div className="stat">
                <div className="n" style={{ fontSize: 20 }}>
                  <span className="light green" />{st.green}　<span className="light yellow" />{st.yellow}　<span className="light red" />{st.red}
                </div>
                <div className="l">QA 綠／黃／紅</div>
              </div>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => downloadBase64(`雙語_${result.lang}_${file?.name ?? "SOP.docx"}`, result.docx)}>
                下載雙語 Word
              </button>
              <span className="small">模型 {result.model}　｜　耗時 {(result.elapsedMs / 1000).toFixed(1)} 秒</span>
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              {st.red === 0 && st.yellow === 0 ? "QA 全數綠燈，可交付。" : "仍有黃燈或紅燈段落，需人工確認後再交付。"}
            </p>
          </section>

          <section className="card">
            <div className="filter">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部 {st.segments}</button>
              <button className={filter === "fixed" ? "active" : ""} onClick={() => setFilter("fixed")}>經術語收尾 {st.fixed}</button>
              <button className={filter === "issue" ? "active" : ""} onClick={() => setFilter("issue")}>黃燈／紅燈 {st.yellow + st.red}</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>QA</th><th>原文</th><th>譯文</th></tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={`light ${s.level}`} />
                        {s.firstPass && <span className="badge">已收尾</span>}
                        {s.issues.map((i) => <div key={i.code} className="small">{i.message}</div>)}
                      </td>
                      <td>{s.source}</td>
                      <td className="tr">
                        {s.translation}
                        {s.firstPass && <div className="before">第一輪：{s.firstPass}</div>}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={3}>沒有符合的段落</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer>
        原型來自實際工作：把廠區中英雙語 SOP 補上當地員工的語言（尼泊爾文、越南文），已正式交付使用。
        公開版用虛構文件重新實作核心流程，不含任何公司資料或程式碼。
        原始碼：<a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </main>
  );
}
