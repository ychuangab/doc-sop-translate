"""產生範例術語表 lib/glossary.json。中英由人工訂定，越南文、印尼文、泰文由 Gemini 依英文定稿翻譯後存檔。
執行：python3 samples-src/make_glossary.py
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TERMS = [
    ("螺旋式空壓機", "screw air compressor"),
    ("空壓機", "air compressor"),
    ("冷凍式乾燥機", "refrigerated air dryer"),
    ("點檢表", "inspection checklist"),
    ("點檢", "routine inspection"),
    ("上鎖掛牌", "lockout/tagout"),
    ("露點", "dew point"),
    ("自動排水器", "automatic drain valve"),
    ("潤滑油", "lubricating oil"),
    ("油過濾器", "oil filter"),
    ("空氣濾網", "air filter"),
    ("壓差", "differential pressure"),
    ("排氣壓力", "discharge pressure"),
    ("排氣溫度", "discharge temperature"),
    ("設備保養人員", "maintenance technician"),
    ("設備主管", "equipment supervisor"),
    ("判定基準", "acceptance criteria"),
    ("冷媒", "refrigerant"),
    ("冷卻器", "cooler"),
    ("控制面板", "control panel"),
    ("運轉時數", "running hours"),
    ("非計畫停機", "unplanned downtime"),
    ("安全眼鏡", "safety glasses"),
    ("防護手套", "protective gloves"),
]

LANGS = {"vi": "越南文", "id": "印尼文", "th": "泰文"}


def api_key():
    for line in (ROOT / ".env.local").read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("缺少 GEMINI_API_KEY")


def translate(code, name):
    prompt = (
        f"把下列工廠設備維護術語翻成{name}，用於標準作業程序。每個術語給一個最常用、最簡潔的正式譯法，"
        "不要加括號說明。依輸入順序輸出。\n" + "\n".join(f"{zh}｜{en}" for zh, en in TERMS)
    )
    schema = {"type": "object", "properties": {"terms": {"type": "array", "items": {"type": "string"}}}, "required": ["terms"]}
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": schema, "temperature": 0},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={api_key()}"
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.loads(json.load(r)["candidates"][0]["content"]["parts"][0]["text"])["terms"]
    assert len(out) == len(TERMS), (code, len(out))
    return out


if __name__ == "__main__":
    cols = {code: translate(code, name) for code, name in LANGS.items()}
    glossary = [
        {"zh": zh, "en": en, **{code: cols[code][i] for code in LANGS}} for i, (zh, en) in enumerate(TERMS)
    ]
    (ROOT / "lib" / "glossary.json").write_text(json.dumps(glossary, ensure_ascii=False, indent=1), encoding="utf-8")
    for g in glossary[:6]:
        print(g)
