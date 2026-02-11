import { put } from "@vercel/blob";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { image, prompt, key, location, color } = await req.json();

    // 1. Base64 사진을 Vercel Blob 주소로 변환
    const blob = await fetch(image).then(r => r.blob());
    const uploadResult = await put(`products/${Date.now()}.png`, blob, {
      access: "public",
      token: process.env.VITE_BLOB_READ_WRITE_TOKEN,
    });

    // 2. ModelsLab V6 호출 (URL 전달)
    const mlRes = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: key,
        init_image: uploadResult.url,
        mask_image: uploadResult.url, // 전체 인페인팅 모드
        prompt: `Professional photography, ${location}, ${color} style, 8k resolution. ${prompt}`,
        width: 1024, height: 1024, samples: 1, safety_checker: "no"
      })
    });

    const mlData = await mlRes.json();
    return new Response(JSON.stringify(mlData), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
