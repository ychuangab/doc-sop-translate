import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOP 文件翻譯",
  description: "上傳中文 SOP，依術語表翻成目標語言並產出雙語 Word，程式 QA 檢查術語、數值與殘留中文，術語不符自動定向修正。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
