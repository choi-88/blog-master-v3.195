import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL;
const SERVER_MARKER = "server-fallback-v5";

const PREFERRED_GEMINI_MODELS = [
  GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-exp"
].filter(Boolean) as string[];

const GEMINI_API_VERSIONS = ["v1", "v1beta"] as const;

const listGeminiModelsForVersion = async (apiVersion: (typeof GEMINI_API_VERSIONS)[number], geminiKey: string): Promise<string[]> => {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${geminiKey}`;
  const response = await fetch(url);
  const result = await response.json();

  if (result.error) {
    return [];
  }

  return (result.models || [])
    .filter((model: any) => (model.supportedGenerationMethods || []).includes("generateContent"))
    .map((model: any) => String(model.name || "").replace("models/", ""))
    .filter(Boolean)
    .filter((name: string) => !/gemini-1\.5-flash/i.test(name));
};

const getModelPairs = async (geminiKey: string): Promise<Array<{ apiVersion: string; modelName: string }>> => {
  const dynamicPairs: Array<{ apiVersion: string; modelName: string }> = [];

  for (const apiVersion of GEMINI_API_VERSIONS) {
    const availableModels = await listGeminiModelsForVersion(apiVersion, geminiKey);

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

  return [...dynamicPairs, ...staticPairs]
    .filter((pair) => !/gemini-1\.5-flash/i.test(pair.modelName))
    .filter((pair, idx, arr) => arr.findIndex((p) => p.apiVersion === pair.apiVersion && p.modelName === pair.modelName) === idx);
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


const requestGeminiGenerateContent = async (url: string, promptText: string) => {
  const payloadVariants = [
    {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { responseMimeType: "application/json" }
    },
    {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { response_mime_type: "application/json" }
    },
    {
      contents: [{ parts: [{ text: promptText }] }]
    }
  ];

  let lastResult: any = null;

  for (const payload of payloadVariants) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!result?.error) {
      return result;
    }

    const apiError = String(result.error?.message || `HTTP ${response.status}`);
    lastResult = result;

    if (!/Unknown name "responseMimeType"|Unknown name "response_mime_type"|Cannot find field/i.test(apiError)) {
      return result;
    }
  }

  return lastResult || { error: { message: "Gemini 응답 없음" } };
};

const generateWithFallback = async (promptText: string, geminiKey: string) => {
  const attempts: string[] = [];
  let lastError = "";

  for (const { apiVersion, modelName } of await getModelPairs(geminiKey)) {
    const label = `${apiVersion}/${modelName}`;
    attempts.push(label);

    try {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${geminiKey}`;
      const result = await requestGeminiGenerateContent(url, promptText);
      if (!result.error) {
        return result;
      }

      const apiError = String(result.error?.message || "HTTP error");
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


const buildSeoTitle = (mainKeyword: string, subKeywords: string): string => {
  const subFirst = String(subKeywords || "").split(",")[0]?.trim() || "";
  const base = `${mainKeyword}${subFirst ? ` ${subFirst}` : ""}`.trim();
  return base.slice(0, 20);
};

const enforceSeoAeoRules = (title: string, body: string, mainKeyword: string, subKeywords: string): { title: string; body: string } => {
  const seoTitle = buildSeoTitle(mainKeyword, subKeywords) || title.slice(0, 20);
  const normalizedBody = normalizeBlogBody(body);
  const bodyWithoutLeading = normalizedBody.replace(/^\s+/, "");
  const firstSentencePattern = /^[^.!?\n]*[.!?]?/;
  const rest = bodyWithoutLeading.replace(firstSentencePattern, "").trimStart();
  const firstSentence = seoTitle;
  const rebuilt = `${firstSentence}. ${rest}`.trim();
  return {
    title: seoTitle,
    body: rebuilt
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!DEFAULT_GEMINI_KEY && !req.body?.geminiApiKey) {
    return res.status(500).json({ error: `GEMINI_API_KEY missing (${SERVER_MARKER})` });
  }

  try {
    const { contentOnly, productName, mainKeyword, subKeywords, geminiApiKey } = req.body || {};
    const runtimeGeminiKey = String(geminiApiKey || DEFAULT_GEMINI_KEY || "").trim();
    const prompt = contentOnly
      ? `기존 설정을 유지하고 블로그 본문만 개선해서 작성하세요. 제품명: ${productName}, 메인 키워드: ${mainKeyword}, 서브 키워드: ${subKeywords}. 본문은 1,500자 이상으로 작성하고 SEO/AEO 최적화를 반영하세요. 제목은 20자 이내로 메인+서브 키워드를 포함해야 하며 본문 첫 문장은 제목과 완전히 동일해야 합니다. 절대로 마크다운 굵게(**) 표기를 사용하지 마세요.`
      : `당신은 SEO/AEO 최적화 전문 에디터입니다. "${productName}" 홍보글을 1,500자 이상의 장문으로 작성하세요. 제목은 20자 이내로 메인 키워드(${mainKeyword})와 서브 키워드(${subKeywords})를 포함해야 합니다. 본문 첫 문장은 제목과 완전히 동일한 한 문장으로 시작하세요. 검색 의도, 구매 의도, Q&A형 AEO 문맥을 반영하고 소제목/본문 어디에도 마크다운 굵게(**)를 사용하지 마세요.`;

    const result = await generateWithFallback(
      `${prompt}\n반드시 순수 JSON으로만 응답하세요: {"title": "제목", "body": "본문", "imagePrompts": [{"nanoPrompt": "English keywords", "description": "image intent"}]}`
    , runtimeGeminiKey);

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = parseGeminiJson(rawText);

    const normalizedBody = normalizeBlogBody(parsed.body);
    const enforced = enforceSeoAeoRules(String(parsed.title || "").replace(/\*\*/g, "").trim(), normalizedBody, String(mainKeyword || ""), String(subKeywords || ""));

    return res.status(200).json({
      title: enforced.title,
      body: enforced.body,
      imagePrompts: parsed.imagePrompts,
      marker: SERVER_MARKER
    });
  } catch (error: any) {
    return res.status(500).json({
      error: `구글 API 에러(${SERVER_MARKER}): ${error?.message || "unknown error"}`
    });
  }
}
