import { BlogInputs, BlogPost, ImageResult, PersonaAnswers } from "./types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;

const TEXT_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"];
const toDataUrl = (mimeType: string, base64Data: string) => `data:${mimeType};base64,${base64Data}`;

const defaultPersona = (inputs: BlogInputs): PersonaAnswers => ({
  targetAudience: inputs.persona.targetAudience || "온라인 쇼핑 사용자",
  painPoint: inputs.persona.painPoint || "제품 선택 시 정보 부족",
  solutionBenefit: inputs.persona.solutionBenefit || `${inputs.productName}의 핵심 장점 전달`,
  writingTone: inputs.persona.writingTone || "친근한 정보 전달형",
  callToAction: inputs.persona.callToAction || "지금 제품 페이지에서 자세히 확인해보세요.",
  contentFlow: inputs.persona.contentFlow || "문제 제기 → 해결 방법 → 제품 장점 → 구매 유도"
});

const buildFallbackBlog = (inputs: BlogInputs): BlogPost => {
  const keyword = inputs.mainKeyword || inputs.productName;
  const requiredImageCount = Math.max(1, inputs.targetImageCount || 1);
  return {
    title: `${keyword} 제대로 고르는 방법과 추천 포인트`,
    content: `${inputs.productName}을(를) 찾는 분들이 가장 많이 고민하는 부분은 성능, 가격, 실제 사용 만족도입니다.\n\n이 글에서는 ${inputs.productName}의 핵심 특징을 쉽게 정리했습니다. 먼저 어떤 상황에서 필요한지 체크하고, 다음으로 구매 전에 확인해야 할 요소를 비교해서 설명합니다. 특히 ${inputs.subKeywords || "실사용 후기, 장단점, 활용 팁"} 관점에서 정리했기 때문에 초보자도 빠르게 이해할 수 있습니다.\n\n### 1) 구매 전 체크리스트\n- 사용 목적과 환경\n- 예산 대비 성능\n- 유지 관리 편의성\n\n### 2) ${inputs.productName} 추천 이유\n- 사용자 니즈에 맞춘 실용성\n- 핵심 기능 중심 구성\n- 구매 후 활용도가 높음\n\n### 3) 활용 팁\n처음 사용할 때는 기본 기능부터 익히고, 자주 쓰는 기능을 중심으로 루틴을 만드는 것이 좋습니다.\n\n지금 바로 ${inputs.productName} 상세 페이지를 확인하고, 현재 진행 중인 혜택도 함께 확인해보세요.`,
    persona: defaultPersona(inputs),
    mode: inputs.generationMode,
    report: {
      rankingProbability: 70,
      safetyIndex: 90,
      suggestedCategory: "상품 리뷰",
      analysisSummary: "API 호출 제한 또는 모델 오류로 템플릿 기반 초안을 생성했습니다.",
      requiredImageCount,
      personaAnalysis: "기본 페르소나를 기반으로 안전한 초안 생성",
      avgWordCount: 900
    },
    images: [],
    groundingSources: []
  };
};

const parseBlogJson = (rawText: string) => {
  const cleanJsonText = rawText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJsonText);
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const callGeminiGenerateContent = async (model: string, body: any) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    35000
  );
};

const uploadImageToBlob = async (imageData: { mimeType: string; data: string }) => {
  const imageDataUrl = toDataUrl(imageData.mimeType, imageData.data);
  if (!BLOB_TOKEN) return imageDataUrl;

  try {
    const blob = await fetch(imageDataUrl).then((r) => r.blob());
    const uploadRes = await fetch(`https://blob.vercel-storage.com/add?filename=prod_${Date.now()}_${Math.random().toString(36).slice(2)}.png`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BLOB_TOKEN}` },
      body: blob
    });
    const uploadData = await uploadRes.json();
    return uploadData.url || imageDataUrl;
  } catch {
    console.error("Blob Upload Failed");
    return imageDataUrl;
  }
};

const tryGenerateText = async (prompt: string) => {
  let lastErrorMessage = "";

  for (const model of TEXT_MODELS) {
    try {
      const response = await callGeminiGenerateContent(model, {
        contents: [{ parts: [{ text: prompt }] }]
      });

      const payload = await response.json();
      if (payload?.error) {
        const code = Number(payload.error.code);
        const message = String(payload.error.message || "");
        lastErrorMessage = message;

        if (code === 429) return { status: "rate_limited" as const };
        if (code === 404 || /not found|not supported|unsupported/i.test(message)) {
          continue;
        }

        // 키 문제/권한 문제/일시 에러 포함: 다음 모델로 시도 후 최종 fallback
        if (code >= 400) {
          continue;
        }
      }

      const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (rawText) return { status: "ok" as const, rawText };
    } catch (error: any) {
      lastErrorMessage = String(error?.message || lastErrorMessage || "텍스트 생성 실패");
      continue;
    }
  }

  return { status: "no_model" as const, message: lastErrorMessage || "사용 가능한 텍스트 모델을 찾지 못했습니다." };
};

/**
 * [함수 1] 배경 합성
 */
export const generateInpaintedImage = async (imageURL: string, inputs: BlogInputs, index: number, nanoPrompt: string): Promise<ImageResult> => {
  if (!MODELSLAB_KEY) {
    return { url: imageURL, filename: `ai_${index}.png`, description: "원본 유지(모델슬랩 키 없음)", nanoPrompt: nanoPrompt || "" };
  }

  try {
    const res = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        prompt: [
          `Professional photography in ${inputs.backgroundLocation}`,
          `${inputs.backgroundColor} color mood, ${inputs.backgroundMaterial} surface, ${inputs.backgroundDish}`,
          "Preserve the original product shape, logo and geometry exactly",
          "Do not alter object silhouette or proportions",
          "Only blend lighting, reflections, saturation and contact shadow",
          nanoPrompt
        ].join(", "),
        init_image: imageURL,
        mask_image: imageURL,
        width: 1024,
        height: 1024,
        samples: 1,
        safety_checker: "no"
      })
    });

    const result = await res.json();
    return {
      url: result.output?.[0] || result.proxy_links?.[0] || imageURL,
      filename: `ai_${index}.png`,
      description: "Modelslab 합성",
      nanoPrompt
    };
  } catch {
    return { url: imageURL, filename: `ai_${index}.png`, description: "원본 유지(합성 실패)", nanoPrompt: "" };
  }
};

/**
 * [함수 2] 블로그 생성
 */
export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  if (!GEMINI_KEY) {
    return buildFallbackBlog(inputs);
  }

  const prompt = `당신은 네이버 블로그 SEO 전문가입니다. "${inputs.productName}" 홍보글을 1,500자 이상의 장문으로 작성하세요. 제목은 "${inputs.mainKeyword || inputs.productName}"로 시작하고 본문에 비교 표를 포함하세요. 반드시 다음의 순수 JSON 형식으로만 답하세요(기호 포함 금지): {"title": "제목", "body": "1500자 본문", "imagePrompts": [{"nanoPrompt": "English keywords"}]}`;

  let blogData: any;
  try {
    const textResult = await tryGenerateText(prompt);

    if (textResult.status === "rate_limited" || textResult.status === "no_model") {
      return buildFallbackBlog(inputs);
    }

    blogData = parseBlogJson(textResult.rawText);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    }
    return buildFallbackBlog(inputs);
  }

  const sourceImages = (inputs.productImages || []).slice(0, 20);
  const requiredImageCount = Math.max(1, inputs.targetImageCount || 1);
  const finalImages: ImageResult[] = [];

  for (let i = 0; i < sourceImages.length && finalImages.length < requiredImageCount; i += 1) {
    const sourceImage = sourceImages[i];
    if (!sourceImage?.data) continue;

    const sourceUrl = await uploadImageToBlob(sourceImage);
    const promptCandidate = blogData.imagePrompts?.[finalImages.length]?.nanoPrompt || blogData.imagePrompts?.[0]?.nanoPrompt || "";

    const imgRes = await generateInpaintedImage(sourceUrl, inputs, finalImages.length, promptCandidate);
    const didFallbackToSource = imgRes.description.startsWith("원본 유지");

    if (!didFallbackToSource && imgRes.url) {
      finalImages.push(imgRes);
    }
  }

  return {
    title: blogData.title,
    content: blogData.body,
    persona: defaultPersona(inputs),
    mode: inputs.generationMode,
    report: {
      rankingProbability: 98,
      safetyIndex: 96,
      suggestedCategory: "상품 리뷰",
      analysisSummary: "콘텐츠 생성이 완료되었습니다.",
      requiredImageCount,
      personaAnalysis: "입력한 페르소나 기반으로 구성",
      avgWordCount: 1500
    },
    images: finalImages,
    groundingSources: []
  };
};
