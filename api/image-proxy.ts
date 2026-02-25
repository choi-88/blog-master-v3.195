import type { VercelRequest, VercelResponse } from "@vercel/node";

const toBase64 = (buffer: ArrayBuffer): string => Buffer.from(buffer).toString("base64");

const inferMimeTypeFromBase64 = (base64: string): string => {
  const sample = base64.slice(0, 20);
  if (sample.startsWith("iVBOR")) return "image/png";
  if (sample.startsWith("/9j/")) return "image/jpeg";
  if (sample.startsWith("UklGR")) return "image/webp";
  if (sample.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
};

const unwrap = (value: string): string => String(value || "").trim().replace(/^b?["']|["']$/g, "");

const tryParseTextPayloadToDataUrl = async (text: string, depth: number): Promise<string | null> => {
  const normalized = unwrap(text).replace(/\n|\r/g, "");
  if (!normalized) return null;

  if (/^data:image\//i.test(normalized)) {
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return await fetchAsDataUrl(normalized, depth + 1);
  }

  if (/^[A-Za-z0-9+/=]+$/.test(normalized) && normalized.length > 64) {
    const mime = inferMimeTypeFromBase64(normalized);
    return `data:${mime};base64,${normalized}`;
  }

  return null;
};

const fetchAsDataUrl = async (targetUrl: string, depth = 0): Promise<string> => {
  if (depth > 2) {
    throw new Error("Upstream redirection depth exceeded");
  }

  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(`Upstream fetch failed: ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.startsWith("image/")) {
    const buffer = await response.arrayBuffer();
    const base64 = toBase64(buffer);
    return `data:${contentType};base64,${base64}`;
  }

  if (contentType.includes("text/plain") || contentType.includes("application/json") || !contentType) {
    const text = await response.text();
    const parsed = await tryParseTextPayloadToDataUrl(text, depth);
    if (parsed) return parsed;
  }

  throw new Error(`Upstream is not image content-type: ${contentType || "unknown"}`);
};

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

    const dataUrl = await fetchAsDataUrl(targetUrl);
    return res.status(200).json({ dataUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "unknown error" });
  }
}
