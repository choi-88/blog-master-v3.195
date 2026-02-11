export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE = "https://modelslab.com/api/v6";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body?.prompt;
    const width = body?.width ?? 1024;
    const height = body?.height ?? 1024;
    const steps = body?.steps ?? 30;

    if (!prompt) return res.status(400).json({ error: "prompt required" });

    const key = process.env.MODELSLAB_API_KEY;
    if (!key) return res.status(500).json({ error: "MODELSLAB_API_KEY missing" });

    // ✅ ModelsLab Flux 텍스트→이미지 (공식 문서 기준)
    const r = await fetch(`${BASE}/images/text2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        model_id: "flux",          // 텍스트 생성은 flux 계열 사용
        prompt,
        width,
        height,
        samples: 1,
        steps,
      }),
    });

    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    return res.status(200).send(text);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
