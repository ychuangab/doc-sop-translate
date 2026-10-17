import { parseGlossary } from "@/lib/glossary.ts";
import { run, type StreamEvent as Event } from "@/lib/pipeline.ts";
import { allow } from "@/lib/ratelimit.ts";
import { LANGS } from "@/lib/translate.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 1024 * 1024;

// 回應為 NDJSON：每行一個事件，最後一行是結果或錯誤
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!allow(ip)) return Response.json({ error: "使用次數過多，請 10 分鐘後再試" }, { status: 429 });
  const form = await req.formData();
  const file = form.get("file");
  const lang = String(form.get("lang") ?? "en");
  const hintTerms = form.get("hintTerms") !== "false";
  const terms = parseGlossary(String(form.get("glossary") ?? "")).slice(0, 200);
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".docx")) {
    return Response.json({ error: "請上傳 DOCX 檔" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return Response.json({ error: "檔案超過 1 MB" }, { status: 400 });
  if (!LANGS[lang]) return Response.json({ error: "不支援的語言" }, { status: 400 });
  const buf = new Uint8Array(await file.arrayBuffer());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(new TextEncoder().encode(JSON.stringify(e) + "\n"));
      try {
        const result = await run(buf, lang, terms, (stage, status, detail) => send({ type: "stage", stage, status, detail }), hintTerms);
        send({ type: "result", result });
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg.length > 300 ? msg.slice(0, 300) + "…" : msg });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
