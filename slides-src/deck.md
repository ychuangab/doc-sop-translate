---
marp: true
size: 16:9
paginate: true
title: 文件翻譯工作台
style: |
  section {
    background: #f6f8fa;
    color: #24292f;
    font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    font-size: 26px;
    padding: 52px 72px 52px 104px;
    border-left: 22px solid #1f2733;
  }
  section::after { color: #8b949e; font-size: 16px; }
  h1 { font-size: 52px; margin: 0 0 12px; color: #24292f; border: none; }
  h2 { font-size: 34px; margin: 0 0 22px; color: #24292f; border: none; }
  .eyebrow { font-size: 15px; letter-spacing: .14em; color: #667080; margin: 0 0 2px; }
  p, li { line-height: 1.6; }
  ul { padding-left: 1.1em; }
  strong { color: #0969da; }
  .muted { color: #667080; font-size: 20px; }
  .card { background: #fff; border: 1px solid #d8dee4; border-radius: 8px; padding: 14px 18px; font-size: 20px; line-height: 1.55; }
  .card b { display: block; font-size: 22px; margin-bottom: 6px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .badge { display: inline-block; padding: 2px 12px; border-radius: 12px; font-size: 18px; }
  .b-tr { background: #ddf4ff; color: #0969da; } .b-qa { background: #fbefff; color: #8250df; }
  .b-fix { background: #fff8c5; color: #9a6700; } .b-ok { background: #dafbe1; color: #1a7f37; }
  .flow { display: flex; gap: 10px; align-items: stretch; }
  .flow .card { flex: 1; font-size: 18px; }
  .flow .card b { font-size: 20px; }
  .arrow { align-self: center; color: #8b949e; }
  .shot { width: 100%; border-radius: 8px; border: 1px solid #d8dee4; display: block; }
  .cap { font-size: 17px; color: #667080; margin-top: 6px; }
  .tr { color: #1b7f3b; }
  .before { color: #8b949e; text-decoration: line-through; }
  section table { display: table; border-collapse: collapse; font-size: 21px; width: 100%; background: #fff; }
  section table th, section table td { background: #fff !important; border: none; border-bottom: 1px solid #d8dee4; padding: 7px 12px; text-align: left; }
  section table th { color: #667080; font-weight: 600; }
  pre { background: #0d1117 !important; color: #c9d1d9; border-radius: 6px; font-size: 16px; padding: 12px 16px; }
---

<!-- _paginate: false -->

<p class="eyebrow">DOCUMENT WORKSPACE</p>

# 文件翻譯工作台

中文 SOP → 外籍員工母語的**雙語對照 Word**

<span class="badge b-tr">translating</span> <span class="badge b-qa">qa</span> <span class="badge b-fix">fixing</span> <span class="badge b-ok">completed</span>

<div class="muted" style="margin-top:28px">

Demo　doc-sop-translate.vercel.app
GitHub　github.com/ychuangab/doc-sop-translate

</div>

---

<p class="eyebrow">BACKGROUND</p>

## 實務背景

- 廠區 SOP 要提供外籍員工的母語版本，而且要和原文對照
- 一般機器翻譯：同一職稱前後**好幾種譯法**、條號數字被改、版面跑掉
- 譯文要交給母語同仁校對，回饋要能回灌、下次不再錯

<div class="card" style="margin-top:22px">
實務版：Python 管線＋本機工作台，支援 Word 插入、Word 追加章節、Excel 就地替換三種輸出；兩個廠區 26 份文件定版交付（尼泊爾文、越南文）。
</div>

---

<p class="eyebrow">ARCHITECTURE</p>

## 解法架構

<div class="flow">
<div class="card"><b>① 抽段配術語</b>含中文的段落（含表格）；術語最長匹配</div>
<div class="arrow">→</div>
<div class="card"><b>② 批次翻譯</b>20 段一批，每段帶編號與必用術語</div>
<div class="arrow">→</div>
<div class="card"><b>③ QA</b>術語、數值條號、殘留中文、退化</div>
<div class="arrow">→</div>
<div class="card"><b>④ 定向收尾</b>只改不符的術語，其他不動</div>
<div class="arrow">→</div>
<div class="card"><b>⑤ 回寫 Word</b>每段下方插入綠色譯文</div>
</div>

<p class="muted" style="margin-top:28px">結構由程式處理、模型只處理文字：模型看不到 Word 的 XML，也就不會弄壞版面。</p>

---

<p class="eyebrow">DESIGN</p>

## 關鍵設計

<div class="grid3">
<div class="card"><b>術語遵從性</b>原文命中術語 → 譯文必須出現定版譯法。比「錯詞清單」嚴格：沒見過的同義詞、整個漏譯都抓得到。</div>
<div class="card"><b>定向收尾</b>不整段重譯、不做字串取代；只改術語並調整文法。收尾若引入紅燈，保留原譯文。</div>
<div class="card"><b>Word XML 回寫</b>沿用段落與文字格式、移除清單編號避免重複計數；表格譯文留在原儲存格。</div>
</div>

---

<p class="eyebrow">WORKSPACE</p>

## 操作畫面：設定與執行

<div class="grid2">
<div><img class="shot" src="img/setup.jpg"><div class="cap">選檔或載入範例；勾選對照組（第一輪不給術語）</div></div>
<div><img class="shot" src="img/done.jpg"><div class="cap">狀態徽章、進度條、交付檢查與技術日誌</div></div>
</div>

---

<p class="eyebrow">OUTPUT</p>

## 操作畫面：結果

<div class="grid2">
<div><img class="shot" src="img/refinish.jpg"><div class="cap">收尾修補：刪除線為第一輪譯文</div></div>
<div><img class="shot" src="img/word.jpg"><div class="cap">雙語 Word：原文下方綠色譯文，表格與標題格式保留</div></div>
</div>

---

<p class="eyebrow">QUALITY</p>

## 驗證成效

<div class="grid2">
<div>

| 範例 SOP（47 段） | 第一輪 | 收尾後 |
|---|---|---|
| 英文・對照組 | 28～35/48 | **48/48** |
| 越南文・對照組 | 24～28/48 | **48/48** |
| 英／越／泰・一般模式 | 48/48 | 48/48 |

</div>
<div class="card">
<b>例：設備保養人員</b>
<span class="before">Equipment Maintenance Personnel</span><br>
<span class="tr">Maintenance Technician</span>（術語表定版）

QA 全數綠燈才標「可交付」；數值或條號遺失、殘留中文一律紅燈。
</div>
</div>

---

<p class="eyebrow">NEXT</p>

## 限制與下一步

<div class="grid2">
<div class="card"><b>限制</b>

- 線上版只做 Word 插入模式、1 MB／200 段內
- 譯文仍需母語同仁校對
- 術語表為範例，實務需逐語言建立

</div>
<div class="card"><b>下一步</b>

- 校對回饋自動盤點、回灌術語表
- 表格內容超框檢查與自動換行
- Excel 表單就地替換模式移植到線上版

</div>
</div>
