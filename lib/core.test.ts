import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import JSZip from "jszip";
import { extractSegments, writeBilingual } from "./docx.ts";
import { matchTerms, missingTerms, parseGlossary } from "./glossary.ts";
import { check, levelOf, missingNumbers } from "./qa.ts";

const terms = parseGlossary("空壓機=air compressor\n螺旋式空壓機=screw air compressor\n點檢=routine inspection\n點檢表=inspection checklist");

test("術語最長匹配、不重疊", () => {
  assert.deepEqual(matchTerms("螺旋式空壓機的點檢表", terms).map((t) => t.zh).sort(), ["螺旋式空壓機", "點檢表"]);
  assert.deepEqual(matchTerms("空壓機點檢", terms).map((t) => t.zh).sort(), ["空壓機", "點檢"]);
});

test("遵從性不分大小寫，抓得到同義詞替換", () => {
  assert.equal(missingTerms("空壓機點檢", "Routine inspection of the Air Compressor", terms).length, 0);
  assert.deepEqual(missingTerms("空壓機點檢", "Daily check of the air compressor", terms).map((t) => t.zh), ["點檢"]);
});

test("數值比對忽略千分位，抓出遺失的條號", () => {
  assert.deepEqual(missingNumbers("6.4 每運轉 4,000 小時更換", "6.4 Replace every 4000 hours"), []);
  assert.deepEqual(missingNumbers("4.2 壓力洩放至 0 MPa", "Release pressure to 0 MPa"), ["4.2"]);
});

test("QA 分級：殘留中文為紅燈，術語不符為黃燈", () => {
  assert.equal(levelOf(check("空壓機", "air compressor 空壓", terms, "en")), "red");
  assert.equal(levelOf(check("空壓機點檢", "Daily check of the air compressor", terms, "en")), "yellow");
  assert.equal(levelOf(check("空壓機點檢", "Routine inspection of the air compressor", terms, "en")), "green");
});

test("回寫雙語 DOCX：每段下方插入譯文，表格段落也處理", async () => {
  const buf = await readFile(new URL("../public/samples/SOP_空壓機日常點檢.docx", import.meta.url));
  const segs = await extractSegments(buf);
  assert.ok(segs.length > 30);
  const out = await writeBilingual(buf, new Map(segs.map((s) => [s.id, `EN:${s.id}`])));
  const xml = await (await JSZip.loadAsync(out)).file("word/document.xml")!.async("string");
  assert.equal((xml.match(/EN:\d+/g) ?? []).length, segs.length);
  // 表格內的譯文仍在儲存格內
  const cell = xml.split("<w:tc>").find((c) => c.includes("排氣壓力"))!;
  assert.match(cell, /EN:\d+/);
  // 重新解析不出錯，且第二次抽取不會把譯文當成待翻段落
  assert.equal((await extractSegments(out)).length, segs.length);
});
