return res.status(200).json({ ok: true, version: "image-edit-v1" });

// /api/image-edit.ts
export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

function b64ToBytes(b64: string) {
  return Buffer.from(b64, "base64");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // body 안전 파싱
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const prompt = body?.prompt;
    const imageBase64 = body?.imageBase64; // "data:image/png;base64,..." 말고 base64만
    const maskBase64 = body?.maskBase64;   // base64만

    if (!prompt || !imageBase64 || !maskBase64) {
      return res.status(400).json({ error: "prompt, imageBase64, maskBase64 required" });
    }

    const apiKey = process.env.OPENAI_API_KEY; // ✅ Vercel Env에 이 이름으로
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing on server" });
    }

    // ✅ 공식 OpenAI 엔드포인트로만 호출
    const url = "https://api.openai.com/v1/images/edits";

    // Node18+ 글로벌 FormData/Blob 사용 (추가 라이브러리 불필요)
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);

    const imgBytes = b64ToBytes(imageBase64);
    const maskBytes = b64ToBytes(maskBase64);

    form.append("image", new Blob([imgBytes], { type: "image/png" }), "image.png");
    form.append("mask", new Blob([maskBytes], { type: "image/png" }), "mask.png");

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const text = await r.text();
    if (!r.ok) {
      // 에러 원문 그대로 돌려주기 (디버깅용)
      return res.status(r.status).send(text);
    }

    // 성공이면 JSON으로 반환
    return res.status(200).json(JSON.parse(text));
  } catch (e: any) {
    return res.status(500).json({ error: "server_exception", message: e?.message || String(e) });
  }
}

