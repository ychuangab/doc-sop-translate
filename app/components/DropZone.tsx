"use client";

import { useState } from "react";

type Props = { role: string; file: File | null; onFile: (f: File) => void; disabled?: boolean };

export function DropZone({ role, file, onFile, disabled }: Props) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop${over ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f && !disabled) onFile(f);
      }}
    >
      <input
        type="file"
        accept=".docx"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <div className="role">{role}</div>
      <div className="hint">點擊選擇或拖曳檔案到這裡</div>
      {file && <div className="file">📄 {file.name}（{(file.size / 1024).toFixed(0)} KB）</div>}
    </label>
  );
}
