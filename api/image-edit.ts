import type { VercelRequest, VercelResponse } from "@vercel/node";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { prompt, imageBase64, maskBase64 } = req.body;

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append(
      "image",
      Buffer.from(imageBase64, "base64"),
      { filename: "image.png" }
    );
    form.append(
      "mask",
      Buffer.from(maskBase64, "base64"),
      { filename: "mask.png" }
    );

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form as any,
    });

    const json = await r.json();
    res.status(200).json(json);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
