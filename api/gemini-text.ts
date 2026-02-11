export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const systemInstruction = (body?.systemInstruction ?? "").trim();
    const userPrompt = (body?.userPrompt ?? "").trim();
    if (!userPrompt) return res.status(400).json({ error: "userPrompt required" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });

    const ai = new GoogleGenAI({ apiKey });

    // ✅ systemInstruction을 타입 안전하게 "프롬프트에 합쳐서" 전달
    const finalPrompt = systemInstruction
      ? `SYSTEM INSTRUCTION:\n${systemInstruction}\n\nUSER:\n${userPrompt}`
      : userPrompt;

    const resp = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json"
      }
    });

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
