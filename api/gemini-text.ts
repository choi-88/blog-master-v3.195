export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const systemInstruction = body?.systemInstruction ?? "";
    const userPrompt = body?.userPrompt;

    if (!userPrompt) return res.status(400).json({ error: "userPrompt required" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });

    const genAI = new GoogleGenerativeAI(apiKey);

    // ✅ 너가 지정한 모델
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction,
    });

    // JSON만 달라 강제 (최대한)
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json"
      },
    });

    const text = result.response.text();

    // 혹시 모델이 JSON 외 텍스트 섞으면 여기서 한번 정리
    // (대부분 responseMimeType로 해결됨)
    return res.status(200).send(text);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
