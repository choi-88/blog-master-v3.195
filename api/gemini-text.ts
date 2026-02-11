export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const systemInstruction = body?.systemInstruction ?? "";
    const userPrompt = body?.userPrompt;
    if (!userPrompt) return res.status(400).json({ error: "userPrompt required" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });

    const ai = new GoogleGenAI({ apiKey });

    const resp = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction,
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    });

    // SDK가 반환하는 텍스트 꺼내기
    const text =
      (resp as any)?.text ??
      (resp as any)?.response?.text?.() ??
      (resp as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") ??
      "";

    if (!text) return res.status(500).json({ error: "Empty Gemini response" });

    return res.status(200).send(text);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
