// /api/generate-image.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const { prompt } = req.body;

    const r = await fetch(
      "https://openai.apikey.run/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VITE_OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "860x860",
          n: 1,
        }),
      }
    );

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: t });
    }

    const json = await r.json();
    return res.status(200).json(json);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}

