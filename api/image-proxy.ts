import type { VercelRequest, VercelResponse } from "@vercel/node";

const toBase64 = (buffer: ArrayBuffer): string => Buffer.from(buffer).toString("base64");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};
    const targetUrl = String(url || "").trim();

    if (!/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: "Invalid url" });
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(502).json({ error: `Upstream fetch failed: ${response.status}` });
    }

    const contentType = String(response.headers.get("content-type") || "");
    if (!contentType.startsWith("image/")) {
      return res.status(415).json({ error: `Upstream is not image content-type: ${contentType || "unknown"}` });
    }

    const buffer = await response.arrayBuffer();
    const base64 = toBase64(buffer);

    return res.status(200).json({ dataUrl: `data:${contentType};base64,${base64}` });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "unknown error" });
  }
}
