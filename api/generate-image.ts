export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body?.prompt;

    if (!prompt) {
      return res.status(400).json({ error: "prompt required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    console.log("API KEY EXISTS:", !!apiKey);
    console.log("API KEY PREFIX:", apiKey?.slice(0, 5));

    if (!apiKey) {
      return res.status(500).json({ error: "API KEY missing" });
    }

    const r = await fetch(
      "https://openai.apikey.run/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey, // 🔥 Bearer 제거
          // "X-API-Key": apiKey, // ← 위가 안 되면 이 줄로 교체
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "512x512",
          n: 1,
        }),
      }
    );

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ upstream_error: t });
    }

    const json = await r.json();
    return res.status(200).json(json);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
