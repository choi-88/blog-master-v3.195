import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL;
const SERVER_MARKER = "server-fallback-v1";

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
          contents: [{ parts: [{ text: promptText }] }]
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
      ? `기존 설정을 유지하고 블로그 본문만 개선해서 작성하세요. 제품명: ${productName}, 메인 키워드: ${mainKeyword}`
      : `당신은 네이버 블로그 SEO 전문가입니다. "${productName}" 홍보글을 1,500자 이상의 장문으로 작성하세요. 제목은 "${mainKeyword}"로 시작하고 본문에 비교 표를 포함하세요.`;

    const result = await generateWithFallback(
      `${prompt}\n반드시 순수 JSON으로만 응답하세요: {"title": "제목", "body": "본문", "imagePrompts": [{"nanoPrompt": "English keywords"}]}`
    );

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleanJsonText = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanJsonText);

    return res.status(200).json({
      title: parsed.title,
      body: parsed.body,
      imagePrompts: parsed.imagePrompts || [],
      marker: SERVER_MARKER
    });
  } catch (error: any) {
    return res.status(500).json({
      error: `구글 API 에러(${SERVER_MARKER}): ${error?.message || "unknown error"}`
    });
  }
}
