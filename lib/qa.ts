// 交付前的品質檢查，全部由程式判定。紅燈必須處理；黃燈（術語不符）可由定向收尾自動修正。
import { missingTerms, type Term } from "./glossary.ts";

export type Level = "green" | "yellow" | "red";
export type Issue = { level: Level; code: string; message: string };

const HAN = /[一-鿿]/;

// 數值與條號：去掉千分位逗號後比對，例如 4,000 與 4000 視為相同
export function numbersOf(text: string): string[] {
  return (text.normalize("NFKC").replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)*/g) ?? []).sort();
}

export function missingNumbers(source: string, translation: string): string[] {
  const have = numbersOf(translation);
  const left = [...have];
  const missing: string[] = [];
  for (const n of numbersOf(source)) {
    const i = left.indexOf(n);
    if (i >= 0) left.splice(i, 1);
    else missing.push(n);
  }
  return missing;
}

// 退化：同一片段大量重複，或譯文長度異常
export function degenerate(source: string, translation: string): boolean {
  if (/(.{4,}?)\1{3,}/.test(translation)) return true;
  return translation.length > Math.max(40, source.length * 8);
}

export function check(source: string, translation: string, terms: Term[], lang: string): Issue[] {
  const issues: Issue[] = [];
  if (!translation.trim()) return [{ level: "red", code: "empty", message: "沒有譯文" }];
  if (lang !== "zh" && HAN.test(translation)) {
    issues.push({ level: "red", code: "han", message: "譯文殘留中文" });
  }
  const nums = missingNumbers(source, translation);
  if (nums.length) issues.push({ level: "red", code: "number", message: `數值或條號遺失：${nums.join("、")}` });
  if (degenerate(source, translation)) issues.push({ level: "red", code: "degenerate", message: "譯文重複或長度異常" });
  const terms_ = missingTerms(source, translation, terms);
  if (terms_.length) {
    issues.push({ level: "yellow", code: "term", message: `術語未依規定：${terms_.map((t) => `${t.zh}→${t.target}`).join("、")}` });
  }
  return issues;
}

export function levelOf(issues: Issue[]): Level {
  if (issues.some((i) => i.level === "red")) return "red";
  if (issues.some((i) => i.level === "yellow")) return "yellow";
  return "green";
}
