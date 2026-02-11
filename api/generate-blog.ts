import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL;
const SERVER_MARKER = "server-fallback-v3";

const PREFERRED_GEMINI_MODELS = [
  GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest"
].filter(Boolean) as string[];

const GEMINI_API_VERSIONS = ["v1", "v1beta"] as const;

const listGeminiModelsForVersion = async (apiVersion: (typeof GEMINI_API_VERSIONS)[number]): Promise<string[]> => {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${GEMINI_KEY}`;
  const response = await fetch(url);
  const result = await response.json();

  if (result.error) {
    return [];
  }

  return (result.models || [])
    .filter((model: any) => (model.supportedGenerationMethods || []).includes("generateContent"))
    .map((model: any) => String(model.name || "").replace("models/", ""))
    .filter(Boolean);
};

const getModelPairs = async (): Promise<Array<{ apiVersion: string; modelName: string }>> => {
  const dynamicPairs: Array<{ apiVersion: string; modelName: string }> = [];

  for (const apiVersion of GEMINI_API_VERSIONS) {
    const availableModels = await listGeminiModelsForVersion(apiVersion);

    const preferredFirst = PREFERRED_GEMINI_MODELS.filter((name) => availableModels.includes(name));
    const flashFamily = availableModels.filter((name) => /flash/i.test(name) && !preferredFirst.includes(name));
    const rest = availableModels.filter((name) => !preferredFirst.includes(name) && !flashFamily.includes(name));

    [...preferredFirst, ...flashFamily, ...rest].forEach((modelName) => {
      dynamicPairs.push({ apiVersion, modelName });
    });
  }

  const staticPairs: Array<{ apiVersion: string; modelName: string }> = [];
  for (const apiVersion of GEMINI_API_VERSIONS) {
    for (const modelName of PREFERRED_GEMINI_MODELS) {
      staticPairs.push({ apiVersion, modelName });
    }
  }

  return [...dynamicPairs, ...staticPairs].filter(
    (pair, idx, arr) => arr.findIndex((p) => p.apiVersion === pair.apiVersion && p.modelName === pair.modelName) === idx
  );
};

const sanitizeJsonText = (input: string): string => {
  const text = input.replace(/```json|```/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const sliced = start >= 0 && end > start ? text.slice(start, end + 1) : text;

  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < sliced.length; i += 1) {
    const ch = sliced[i];

    if (!inString) {
      const code = ch.charCodeAt(0);
      if (code < 0x20 && ch !== "\n" && ch !== "\r" && ch !== "\t") {
        out += " ";
        continue;
      }

      if (ch === '"') {
        inString = true;
      }
      out += ch;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }

    if (ch === "\r") {
      out += "\\r";
      continue;
    }

    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += " ";
      continue;
    }

    out += ch;
  }

  return out;
};

const parseGeminiJson = (rawText: string): { title: string; body: string; imagePrompts: Array<{ nanoPrompt?: string }> } => {
  const attempts = [
    sanitizeJsonText(rawText),
    sanitizeJsonText(rawText).replace(/\u0000|\u0001|\u0002|\u0003|\u0004|\u0005|\u0006|\u0007|\u0008|\u000b|\u000c|\u000e|\u000f|\u0010|\u0011|\u0012|\u0013|\u0014|\u0015|\u0016|\u0017|\u0018|\u0019|\u001a|\u001b|\u001c|\u001d|\u001e|\u001f/g, " ")
  ];

  let parsed: any = null;
  let lastParseError = "";

  for (const candidate of attempts) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch (error: any) {
      lastParseError = error?.message || "unknown parse error";
    }
  }

  if (!parsed) {
    throw new Error(`Gemini JSON 파싱 실패: ${lastParseError}`);
  }

  if (!parsed?.title || !parsed?.body) {
    throw new Error("Gemini JSON 응답에 title/body가 없습니다.");
  }

  return {
    title: String(parsed.title),
    body: String(parsed.body),
    imagePrompts: Array.isArray(parsed.imagePrompts) ? parsed.imagePrompts : []
  };
};



const normalizeBlogBody = (body: string): string => {
  const withoutBold = body.replace(/\*\*/g, "");
  return withoutBold.trim();
};

const generateWithFallback = async (promptText: string) => {
  const attempts: string[] = [];
  let lastError = "";

  for (const { apiVersion, modelName } of await getModelPairs()) {
    const label = `${apiVersion}/${modelName}`;
    attempts.push(label);

    try {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${GEMINI_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      const result = await response.json();
      if (!result.error) {
        return result;
      }

      const apiError = result.error.message || `HTTP ${response.status}`;
      lastError = `${label} -> ${apiError}`;
      if (!/not found|not supported|unsupported|permission denied|404/i.test(apiError)) {
        throw new Error(lastError);
      }
    } catch (error: any) {
      lastError = `${label} -> ${error?.message || "unknown error"}`;
      if (!/not found|not supported|unsupported|permission denied|404/i.test(lastError)) {
        throw new Error(lastError);
      }
    }
  }

  throw new Error(`모델 탐색 실패(${SERVER_MARKER}): ${lastError}. tried=${attempts.join(",")}`);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GEMINI_KEY) {
    return res.status(500).json({ error: `GEMINI_API_KEY missing (${SERVER_MARKER})` });
  }

  try {
    const { contentOnly, productName, mainKeyword } = req.body || {};
    const prompt = contentOnly
      ? `기존 설정을 유지하고 블로그 본문만 개선해서 작성하세요. 제품명: ${productName}, 메인 키워드: ${mainKeyword}. 본문은 1,500자 이상으로 작성하고 네이버 SEO와 GEO 최적화를 반영하세요. 절대로 마크다운 굵게(**) 표기를 사용하지 마세요.`
      : `당신은 네이버 SEO/GEO 최적화 전문 에디터입니다. "${productName}" 홍보글을 1,500자 이상의 장문으로 작성하세요. 제목은 "${mainKeyword}"로 시작하고 검색 의도, 구매 의도, 지역 맥락을 반영한 실전형 구조로 작성하세요. 소제목과 본문 어디에도 마크다운 굵게(**)를 사용하지 마세요.`;

    const result = await generateWithFallback(
      `${prompt}\n반드시 순수 JSON으로만 응답하세요: {"title": "제목", "body": "본문", "imagePrompts": [{"nanoPrompt": "English keywords", "description": "image intent"}]}`
    );

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = parseGeminiJson(rawText);

    const normalizedBody = normalizeBlogBody(parsed.body);

    return res.status(200).json({
      title: String(parsed.title || "").replace(/\*\*/g, "").trim(),
      body: normalizedBody,
      imagePrompts: parsed.imagePrompts,
      marker: SERVER_MARKER
    });
  } catch (error: any) {
    return res.status(500).json({
      error: `구글 API 에러(${SERVER_MARKER}): ${error?.message || "unknown error"}`
    });
  }
}
