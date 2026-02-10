import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // 1️⃣ 메서드 가드
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 2️⃣ body 안전 파싱
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const prompt = body?.prompt;
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    // 3️⃣ API KEY 체크
    const apiKey = process.env.OPENAI_API_KEY; // 🔥 이름 바꿈 (중요)
    if (!apiKey) {
      return res.status(500).json({ error: "API KEY missing on server" });
    }

    // 4️⃣ fetch
    const r = await fetch("https://openai.apikey.run/v1/images/generations", {
      method: "POST",
     headers: {
  "Content-Type": "application/json",
  Authorization: apiKey, // 🔥 Bearer 제거
},
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "512x512",
        n: 1,
      }),
    });

    // 5️⃣ upstream 에러 그대로 전달
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ upstream_error: t });
    }

    const json = await r.json();
    return res.status(200).json(json);
  } catch (e: any) {
    return res.status(500).json({
      error: "server_exception",
      message: e?.message || String(e),
    });
  }
}

