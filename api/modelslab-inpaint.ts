export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE = "https://modelslab.com/api/v6";

async function base64ToUrl(key: string, dataUrl: string) {
  const r = await fetch(`${BASE}/image_editing/base64_to_url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, init_image: dataUrl }),
  });

  const j = await r.json();
  const url = j?.output?.[0];
  if (!url) throw new Error(`base64_to_url failed: ${JSON.stringify(j)}`);
  return url;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const prompt = body?.prompt;
    const imageDataUrl = body?.imageDataUrl; // "data:image/png;base64,...."
    const maskDataUrl = body?.maskDataUrl;   // "data:image/png;base64,...."

    if (!prompt || !imageDataUrl || !maskDataUrl) {
      return res.status(400).json({ error: "prompt, imageDataUrl, maskDataUrl required" });
    }

    const key = process.env.MODELSLAB_API_KEY;
    if (!key) return res.status(500).json({ error: "MODELSLAB_API_KEY missing" });

    // 1) 원본/마스크를 URL로 변환 (ModelsLab이 URL 입력 선호)
    const init_image = await base64ToUrl(key, imageDataUrl);
    const mask_image = await base64ToUrl(key, maskDataUrl);

    // 2) 마스크 인페인팅 엔드포인트 호출
    const r = await fetch(`${BASE}/image_editing/inpaint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        init_image,
        mask_image,
        prompt,
        // 필요 시 옵션 추가 가능(steps, guidance 등은 문서 스펙에 맞춰 추가)
      }),
    });

    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    return res.status(200).send(text);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
