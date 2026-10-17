"use client";

import { useEffect, useRef, useState } from "react";
import glossary from "@/lib/glossary.json";
import type { Stage, StreamEvent, TranslateResult } from "@/lib/pipeline.ts";

const SAMPLE = "SOP_空壓機日常點檢.docx";
const REPO_URL = "https://github.com/ychuangab/doc-sop-translate";
const LANGS: [string, string][] = [["en", "英文 en"], ["vi", "越南文 vi"], ["id", "印尼文 id"], ["th", "泰文 th"]];

type Page = "translate" | "refinish" | "glossary" | "qa" | "preview";
type Row = { zh: string; target: string };
const defaultRows = (lang: string): Row[] => (glossary as { [k: string]: string }[]).map((g) => ({ zh: g.zh, target: g[lang] }));

// 階段 → 原工作台的狀態徽章與進度
const PHASE: { [k in Stage]: { badge: string; pct: number } } = {
  extract: { badge: "translating", pct: 10 },
  translate: { badge: "translating", pct: 55 },
  qa: { badge: "qa", pct: 70 },
  fix: { badge: "fixing", pct: 88 },
  write: { badge: "translating", pct: 96 },
};

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

const now = () => new Date().toTimeString().slice(0, 8);

export default function Home() {
  const [page, setPage] = useState<Page>("translate");
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState("en");
  const [rows, setRows] = useState<Row[]>(defaultRows("en"));
  const [baseline, setBaseline] = useState(false);
  const [phase, setPhase] = useState<{ badge: string; pct: number; label: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  async function run(f: File) {
    setRunning(true);
    setResult(null);
    setError(null);
    setLog([`${now()} 開始：${f.name} → ${lang}${baseline ? "（對照組：第一輪不給術語）" : ""}`]);
    setPhase({ badge: "queued", pct: 2, label: "queued" });
    try {
      const body = new FormData();
      body.append("file", f);
      body.append("lang", lang);
      body.append("glossary", rows.filter((r) => r.zh && r.target).map((r) => `${r.zh}=${r.target}`).join("\n"));
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
            const p = PHASE[e.stage];
            if (e.status === "start") setPhase({ ...p, label: p.badge });
            setLog((l) => [...l, `${now()} ${e.stage.padEnd(9)} ${e.status}${e.detail ? `  ${e.detail}` : ""}`]);
          } else if (e.type === "result") {
            setResult(e.result);
            setPhase({ badge: "completed", pct: 100, label: "completed" });
            setLog((l) => [...l, `${now()} done      ${(e.result.elapsedMs / 1000).toFixed(1)}s  ${e.result.model}`]);
          } else {
            throw new Error(e.message);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase({ badge: "failed", pct: 100, label: "failed" });
      setLog((l) => [...l, `${now()} error     ${msg}`]);
    } finally {
      setRunning(false);
    }
  }

  async function useSample(start: boolean) {
    const res = await fetch(`/samples/${encodeURIComponent(SAMPLE)}`);
    const f = new File([await res.blob()], SAMPLE);
    setFile(f);
    if (start) run(f);
  }

  // 網址帶 ?sample=1 時以對照組自動跑範例，直接看到術語收尾
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (new URLSearchParams(window.location.search).get("sample") === "1") {
      setBaseline(true);
      useSample(false).then(() => setTimeout(() => document.getElementById("tr-start")?.click(), 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = result?.stats;
  const fixed = result?.segments.filter((s) => s.firstPass) ?? [];
  const flagged = result?.segments.filter((s) => s.level !== "green") ?? [];
  const nav: [Page, string, number | null][] = [
    ["translate", "翻譯", null],
    ["refinish", "收尾修補", result ? fixed.length : null],
    ["glossary", "術語表", rows.length],
    ["qa", "QA 報告", result ? flagged.length : null],
    ["preview", "成品預覽", result ? result.segments.length : null],
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">文件翻譯工作台</div>
        <nav>
          {nav.map(([k, label, n]) => (
            <button key={k} className={`nav-item${page === k ? " active" : ""}`} onClick={() => setPage(k)}>
              {label}{n !== null && <span className="count">{n}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>・範例為虛構文件</div>
      </aside>

      <div className="main">
        <div className="mobile-nav">
          {nav.map(([k, label]) => <button key={k} className={page === k ? "active" : ""} onClick={() => setPage(k)}>{label}</button>)}
        </div>
        <header className="topbar">
          <label>語言
            <select value={lang} disabled={running} onChange={(e) => { setLang(e.target.value); setRows(defaultRows(e.target.value)); }}>
              {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          <span className="badge flow">interleave・段落下方插入譯文</span>
          <span className="top-msg">{running ? "翻譯中…" : result ? `上次：${result.segments.length} 段・${(result.elapsedMs / 1000).toFixed(1)} 秒` : ""}</span>
        </header>

        <main>
          {page === "translate" && (
            <section>
              <p className="eyebrow">DOCUMENT WORKSPACE</p>
              <h2>準備一批翻譯</h2>
              <ol className="steps">
                <li className={file ? "on" : ""}><b>1</b>選擇文件</li>
                <li className={file ? "on" : ""}><b>2</b>核對設定</li>
                <li className={result ? "on" : ""}><b>3</b>執行與驗收</li>
              </ol>

              <div className="card">
                <div className="row">
                  <button onClick={() => fileInput.current?.click()} disabled={running}>選檔案…</button>
                  <button onClick={() => useSample(false)} disabled={running}>載入範例 SOP</button>
                  <input ref={fileInput} type="file" accept=".docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                  <a className="muted" href={`/samples/${SAMPLE}`} download>下載範例</a>
                </div>
                {file ? (
                  <table>
                    <thead><tr><th>檔案</th><th>格式</th><th>處理狀態</th></tr></thead>
                    <tbody>
                      <tr>
                        <td>{file.name}</td>
                        <td>docx</td>
                        <td><span className={`badge ${phase?.badge ?? ""}`}>{phase?.label ?? "待處理"}</span></td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">選擇中文 SOP（.docx），或載入範例</div>
                )}
                <div className="row">
                  <label><input type="checkbox" checked={baseline} disabled={running} onChange={(e) => setBaseline(e.target.checked)} /> 對照組：第一輪不給術語</label>
                  <span className="muted">（看 QA 抓出術語漂移後如何修正）</span>
                </div>
                <div className="row">
                  <button id="tr-start" className="primary" disabled={running || !file} onClick={() => run(file!)}>開始翻譯</button>
                  <button disabled={running} onClick={() => { setBaseline(true); useSample(true); }}>▶ 一鍵跑範例</button>
                </div>
              </div>

              {phase && (
                <div className="card">
                  <div className="row">
                    <span className={`badge ${phase.badge}`}>{phase.label}</span>
                    <div className="progress"><div style={{ width: `${phase.pct}%` }} /></div>
                  </div>
                  {error && <p className="err-text">⚠ {error}</p>}
                  {result && st && (
                    <>
                      <h3>交付檢查</h3>
                      <div className="qa-summary">
                        <span><span className="dot green" />{st.green}</span>
                        <span><span className="dot yellow" />{st.yellow}</span>
                        <span><span className="dot red" />{st.red}</span>
                        <span className="muted">術語 {st.termOkBefore}→{st.termOkAfter}/{st.termHits}・收尾 {st.fixed} 段</span>
                      </div>
                      <p className={st.red + st.yellow === 0 ? "ok-text" : "err-text"}>
                        {st.red + st.yellow === 0 ? "✓ 全數綠燈，可交付" : "仍有黃燈／紅燈，需人工確認"}
                      </p>
                      <div className="row">
                        <button className="primary" onClick={() => downloadBase64(`雙語_${result.lang}_${file?.name ?? "SOP.docx"}`, result.docx)}>下載雙語 Word</button>
                        {st.fixed > 0 && <button onClick={() => setPage("refinish")}>看收尾修補（{st.fixed}）</button>}
                        <button onClick={() => setPage("preview")}>成品預覽</button>
                      </div>
                    </>
                  )}
                  <details open={running}>
                    <summary>技術日誌</summary>
                    <pre className="log">{log.join("\n")}</pre>
                  </details>
                </div>
              )}
            </section>
          )}

          {page === "refinish" && (
            <section>
              <h2>收尾修補</h2>
              {!result ? <div className="empty-state">先執行翻譯</div> : fixed.length === 0 ? (
                <div className="card muted">第一輪術語已全部符合，不需收尾。勾選「對照組」可看到收尾效果。</div>
              ) : (
                <div className="card table-scroll">
                  <p className="muted" style={{ marginTop: 0 }}>只改不符的術語，其他文字不動。</p>
                  <table>
                    <thead><tr><th>原文</th><th>收尾後（刪除線為第一輪）</th></tr></thead>
                    <tbody>
                      {fixed.map((s) => (
                        <tr key={s.id}>
                          <td className="src">{s.source}</td>
                          <td className="tr">{s.translation}<div className="before">{s.firstPass}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {page === "glossary" && (
            <section>
              <h2>術語表 <span className="muted" style={{ fontSize: 14 }}>{LANGS.find(([c]) => c === lang)?.[1]}・{rows.length} 條</span></h2>
              <div className="card table-scroll">
                <table className="gl-table">
                  <thead><tr><th>中文</th><th>定版譯法</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td><input type="text" value={r.zh} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, zh: e.target.value } : x)))} /></td>
                        <td><input type="text" value={r.target} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} /></td>
                        <td><button onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="刪除">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row">
                  <button onClick={() => setRows([...rows, { zh: "", target: "" }])}>＋ 新增</button>
                  <button onClick={() => setRows(defaultRows(lang))}>還原預設</button>
                  <span className="muted">比對採最長匹配；下次翻譯生效</span>
                </div>
              </div>
            </section>
          )}

          {page === "qa" && (
            <section>
              <h2>QA 報告</h2>
              {!result || !st ? <div className="empty-state">先執行翻譯</div> : (
                <div className="card table-scroll">
                  <div className="qa-summary">
                    <span><span className="dot green" />綠 {st.green}</span>
                    <span><span className="dot yellow" />黃 {st.yellow}</span>
                    <span><span className="dot red" />紅 {st.red}</span>
                  </div>
                  <table>
                    <thead><tr><th>檢查項目</th><th>規則</th><th>結果</th></tr></thead>
                    <tbody>
                      <tr><td>術語遵從</td><td className="muted">原文命中術語 → 譯文須含定版譯法</td><td>{st.termOkAfter}/{st.termHits}</td></tr>
                      <tr><td>數值與條號</td><td className="muted">原文數字都要出現在譯文</td><td>{flagged.some((s) => s.issues.some((i) => i.code === "number")) ? "✕" : "✓"}</td></tr>
                      <tr><td>殘留中文</td><td className="muted">譯文不得含中文</td><td>{flagged.some((s) => s.issues.some((i) => i.code === "han")) ? "✕" : "✓"}</td></tr>
                      <tr><td>退化</td><td className="muted">重複片段或長度異常</td><td>{flagged.some((s) => s.issues.some((i) => i.code === "degenerate")) ? "✕" : "✓"}</td></tr>
                    </tbody>
                  </table>
                  {flagged.length > 0 && (
                    <table style={{ marginTop: 12 }}>
                      <thead><tr><th>原文</th><th>問題</th></tr></thead>
                      <tbody>
                        {flagged.map((s) => (
                          <tr key={s.id} className="warn-row"><td>{s.source}</td><td>{s.issues.map((i) => i.message).join("；")}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </section>
          )}

          {page === "preview" && (
            <section>
              <h2>成品預覽</h2>
              {!result ? <div className="empty-state">先執行翻譯</div> : (
                <div className="card table-scroll">
                  <table>
                    <thead><tr><th>原文</th><th>譯文</th></tr></thead>
                    <tbody>
                      {result.segments.map((s) => (
                        <tr key={s.id} className={s.level !== "green" ? "warn-row" : ""}>
                          <td className="src">{s.source}</td>
                          <td className="tr">{s.translation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
