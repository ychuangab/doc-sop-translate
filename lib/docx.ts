// Word 結構由程式處理，模型只碰文字：抽出含中文的段落（含表格儲存格），
// 回寫時在每段原文下方插入一段綠色譯文，沿用原段落格式但移除清單編號，避免編號被重複計數。
import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom";
import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const HAN = /[一-鿿]/;
// OOXML 規定 rPr 子元素順序；顏色要插在下列元素之前，否則 Word 可能判定檔案損毀
const AFTER_COLOR = new Set(["spacing", "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd",
  "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath"]);

export type Segment = { id: number; text: string };

function paragraphText(p: Element): string {
  const ts = p.getElementsByTagNameNS(W, "t");
  let s = "";
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent ?? "";
  return s;
}

async function load(buf: ArrayBuffer | Uint8Array) {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("不是有效的 DOCX 檔");
  const doc = new DOMParser().parseFromString(await file.async("string"), "text/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  const all = body.getElementsByTagNameNS(W, "p");
  const paragraphs: Element[] = [];
  for (let i = 0; i < all.length; i++) paragraphs.push(all[i]);
  return { zip, doc, paragraphs };
}

// 只翻含中文的段落；純數字、代碼、空白段落保留原樣
export async function extractSegments(buf: ArrayBuffer | Uint8Array): Promise<Segment[]> {
  const { paragraphs } = await load(buf);
  return paragraphs
    .map((p, id) => ({ id, text: paragraphText(p).trim() }))
    .filter((s) => HAN.test(s.text));
}

export async function writeBilingual(buf: ArrayBuffer | Uint8Array, translations: Map<number, string>): Promise<Uint8Array> {
  const { zip, doc, paragraphs } = await load(buf);
  paragraphs.forEach((p, id) => {
    const text = translations.get(id);
    if (!text) return;
    const np = doc.createElementNS(W, "w:p");
    const pPr = p.getElementsByTagNameNS(W, "pPr")[0];
    if (pPr && pPr.parentNode === p) {
      const copy = pPr.cloneNode(true) as Element;
      const numPr = copy.getElementsByTagNameNS(W, "numPr")[0];
      if (numPr) copy.removeChild(numPr);
      np.appendChild(copy);
    }
    const r = doc.createElementNS(W, "w:r");
    // 沿用原文第一個文字段的格式（粗體、字級），只把顏色換成綠色
    const firstRPr = p.getElementsByTagNameNS(W, "r")[0]?.getElementsByTagNameNS(W, "rPr")[0];
    const rPr = firstRPr ? (firstRPr.cloneNode(true) as Element) : doc.createElementNS(W, "w:rPr");
    for (const old of Array.from(rPr.getElementsByTagNameNS(W, "color"))) rPr.removeChild(old);
    const color = doc.createElementNS(W, "w:color");
    color.setAttributeNS(W, "w:val", "1B7F3B");
    const next = Array.from(rPr.childNodes).find((n) => AFTER_COLOR.has((n as Element).localName ?? ""));
    rPr.insertBefore(color, next ?? null);
    r.appendChild(rPr);
    const t = doc.createElementNS(W, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.appendChild(doc.createTextNode(text));
    r.appendChild(t);
    np.appendChild(r);
    p.parentNode!.insertBefore(np, p.nextSibling);
  });
  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
