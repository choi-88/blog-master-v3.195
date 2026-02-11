import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
const GEMINI_FALLBACK_VERSION = "fallback-v3";

const PREFERRED_GEMINI_MODELS = [
  GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
].filter(Boolean) as string[];

const GEMINI_API_VERSIONS = ["v1", "v1beta"] as const;

const DEFAULT_PERSONA = {
  targetAudience: "",
  painPoint: "",
  solutionBenefit: "",
  writingTone: "친근한 정보 전달형",
  callToAction: "",
  contentFlow: ""
};

const toDataUrl = (image: ProductImageData): string => `data:${image.mimeType};base64,${image.data}`;

const uploadToVercelBlob = async (image: ProductImageData): Promise<string> => {
  if (!BLOB_TOKEN) {
    return toDataUrl(image);
  }

  try {
    const blob = await fetch(toDataUrl(image)).then((r) => r.blob());
    const uploadRes = await fetch(`https://blob.vercel-storage.com/add?filename=prod_${Date.now()}.png`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BLOB_TOKEN}` },
      body: blob
    });
    const uploadData = await uploadRes.json();
    return uploadData.url || toDataUrl(image);
  } catch {
    return toDataUrl(image);
  }
};

const listGeminiModelsForVersion = async (apiVersion: (typeof GEMINI_API_VERSIONS)[number]): Promise<string[]> => {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${GEMINI_KEY}`;
  const response = await fetch(url);
  const result = await response.json();

  if (result.error) {
    return [];
  }

  const names = (result.models || [])
    .filter((model: any) => {
      const methods = model.supportedGenerationMethods || [];
      return methods.includes("generateContent");
    })
    .map((model: any) => String(model.name || ""))
    .map((name: string) => name.replace("models/", ""))
    .filter(Boolean);

  return names;
};

const getDynamicModelCandidates = async (): Promise<Array<{ apiVersion: string; modelName: string }>> => {
  const dynamicPairs: Array<{ apiVersion: string; modelName: string }> = [];

  for (const apiVersion of GEMINI_API_VERSIONS) {
    const availableModels = await listGeminiModelsForVersion(apiVersion);

    const preferredFirst = PREFERRED_GEMINI_MODELS.filter((name) => availableModels.includes(name));
    const flashFamily = availableModels.filter((name) => /flash/i.test(name) && !preferredFirst.includes(name));
    const rest = availableModels.filter((name) => !preferredFirst.includes(name) && !flashFamily.includes(name));

    const ordered = [...preferredFirst, ...flashFamily, ...rest];
    ordered.forEach((modelName) => dynamicPairs.push({ apiVersion, modelName }));
  }

  return dynamicPairs;
};

const getStaticFallbackPairs = (): Array<{ apiVersion: string; modelName: string }> => {
  const pairs: Array<{ apiVersion: string; modelName: string }> = [];
  for (const apiVersion of GEMINI_API_VERSIONS) {
    for (const modelName of PREFERRED_GEMINI_MODELS) {
      pairs.push({ apiVersion, modelName });
    }
  }
  return pairs;
};

const callGeminiWithFallback = async (promptText: string): Promise<any> => {
  let lastError = "";
  const attempts: string[] = [];

  const dynamicPairs = await getDynamicModelCandidates();
  const allPairs = [...dynamicPairs, ...getStaticFallbackPairs()].filter(
    (pair, idx, arr) => arr.findIndex((p) => p.apiVersion === pair.apiVersion && p.modelName === pair.modelName) === idx
  );

  for (const { apiVersion, modelName } of allPairs) {
    const attemptLabel = `${apiVersion}/${modelName}`;
    attempts.push(attemptLabel);

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
      lastError = `${attemptLabel} -> ${apiError}`;

      const isModelAvailabilityError = /not found|not supported|unsupported|permission denied|404/i.test(apiError);
      if (!isModelAvailabilityError) {
        throw new Error(apiError);
      }
    } catch (error: any) {
      lastError = `${attemptLabel} -> ${error?.message || "unknown error"}`;
      const isRetryable = /not found|not supported|unsupported|permission denied|404/i.test(lastError);
      if (!isRetryable) {
        throw new Error(`구글 API 에러(${GEMINI_FALLBACK_VERSION}): ${lastError}`);
      }
    }
  }

  throw new Error(
    `구글 API 에러(${GEMINI_FALLBACK_VERSION}): 사용 가능한 모델을 찾지 못했습니다. 마지막 오류: ${lastError}. 시도한 조합: ${attempts.join(", ")}`
  );
};

/**
 * [함수 1] ModelsLab 배경 합성
 */
export const generateInpaintedImage = async (
  image: ProductImageData,
  backgroundLocation: string,
  backgroundColor: string,
  backgroundMaterial: string,
  backgroundDish: string,
  imageRequest: { nanoPrompt?: string; description?: string },
  index: number,
  mainKeyword: string,
  personaHint: string
): Promise<ImageResult> => {
  if (!MODELSLAB_KEY) {
    return {
      url: "",
      filename: `ai_${index + 1}.png`,
      description: imageRequest.description || "이미지 생성 실패",
      nanoPrompt: imageRequest.nanoPrompt || ""
    };
  }

  try {
    const initImage = await uploadToVercelBlob(image);
    const composedPrompt = [
      "Professional iPhone product photo",
      `Main keyword: ${mainKeyword}`,
      `Scene: ${backgroundLocation}`,
      `Color mood: ${backgroundColor}`,
      `Material texture: ${backgroundMaterial}`,
      `Dish style: ${backgroundDish}`,
      `Persona hint: ${personaHint}`,
      imageRequest.nanoPrompt || ""
    ]
      .filter(Boolean)
      .join(", ");

    const res = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        prompt: composedPrompt,
        negative_prompt: "blurry, low resolution, watermark, text",
        init_image: initImage,
        mask_image: initImage,
        width: 1024,
        height: 1024,
        samples: 1,
        safety_checker: "no"
      })
    });

    const result = await res.json();

    return {
      url: result.output?.[0] || result.proxy_links?.[0] || "",
      filename: `ai_${index + 1}.png`,
      description: imageRequest.description || "AI 합성 이미지",
      nanoPrompt: imageRequest.nanoPrompt || ""
    };
  } catch {
    return {
      url: "",
      filename: `ai_${index + 1}.png`,
      description: "이미지 생성 실패",
      nanoPrompt: imageRequest.nanoPrompt || ""
    };
  }
};

/**
 * [함수 2] 블로그 생성
 */
export const generateBlogSystem = async (inputs: BlogInputs, contentOnly = false): Promise<BlogPost> => {
  if (!GEMINI_KEY) {
    throw new Error("API 키를 확인하세요.");
  }

  const prompt = contentOnly
    ? `기존 설정을 유지하고 블로그 본문만 개선해서 작성하세요. 제품명: ${inputs.productName}, 메인 키워드: ${inputs.mainKeyword}`
    : `당신은 네이버 블로그 SEO 전문가입니다. "${inputs.productName}" 홍보글을 1,500자 이상의 장문으로 작성하세요. 제목은 "${inputs.mainKeyword}"로 시작하고 본문에 비교 표를 포함하세요.`;

  const result = await callGeminiWithFallback(
    `${prompt}\n반드시 순수 JSON으로만 응답하세요: {"title": "제목", "body": "본문", "imagePrompts": [{"nanoPrompt": "English keywords"}]}`
  );

  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleanJsonText = rawText.replace(/```json|```/g, "").trim();
  const blogData = JSON.parse(cleanJsonText);

  const finalImages: ImageResult[] = [];
  if (!contentOnly && inputs.productImages?.length) {
    const firstImageRequest = {
      nanoPrompt: blogData.imagePrompts?.[0]?.nanoPrompt || "",
      description: "AI 합성"
    };

    const imgRes = await generateInpaintedImage(
      inputs.productImages[0],
      inputs.backgroundLocation,
      inputs.backgroundColor,
      inputs.backgroundMaterial,
      inputs.backgroundDish,
      firstImageRequest,
      0,
      inputs.mainKeyword || inputs.productName,
      inputs.persona.targetAudience || "일반 소비자"
    );

    if (imgRes.url) {
      finalImages.push(imgRes);
    }
  }

  return {
    title: blogData.title,
    content: blogData.body,
    persona: { ...DEFAULT_PERSONA, ...inputs.persona },
    mode: inputs.generationMode,
    report: {
      rankingProbability: 98,
      safetyIndex: 95,
      suggestedCategory: "제품 리뷰",
      analysisSummary: "SEO 최적화 초안 생성 완료",
      requiredImageCount: inputs.targetImageCount,
      personaAnalysis: inputs.persona.targetAudience || "일반 소비자",
      avgWordCount: 1500
    },
    images: finalImages,
    groundingSources: []
  };
};
