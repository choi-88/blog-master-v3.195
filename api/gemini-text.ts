export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const systemInstruction = (body?.systemInstruction ?? "").trim();
    const userPrompt = (body?.userPrompt ?? "").trim();
    if (!userPrompt) return res.status(400).json({ error: "userPrompt required" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });

    // ✅ 모델명: "models/" 붙이지 말 것
    // 필요하면 "gemini-1.5-flash-latest"로 바꿔도 됨
    const model = "gemini-1.5-flash-latest";

    // ✅ systemInstruction은 프롬프트에 합치기(호환성 최고)
    const finalPrompt = systemInstruction
      ? `SYSTEM INSTRUCTION:\n${systemInstruction}\n\nUSER:\n${userPrompt}`
      : userPrompt;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: finalPrompt }],
          },
        ],
        // ✅ 여기서는 타입 에러 없음 (REST라 TS 타입 무관)
        generationConfig: {
          temperature: 0.3,
        },
      }),
    });

    const json = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json(json);
    }

    const text =
      json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") ?? "";

    if (!text) return res.status(500).json({ error: "Empty Gemini response", raw: json });

    return res.status(200).send(text);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
