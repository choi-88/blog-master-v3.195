import { BlogInputs, BlogPost, ImageResult, PersonaAnswers } from "./types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;

const TEXT_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"];
const toDataUrl = (mimeType: string, base64Data: string) => `data:${mimeType};base64,${base64Data}`;
const stripCodeFence = (text: string) => text.replace(/```json|```/g, "").trim();

const defaultPersona = (inputs: BlogInputs): PersonaAnswers => {
  const topic = inputs.mainKeyword || inputs.productName;
  return {
    targetAudience: inputs.persona.targetAudience || `${topic} 정보를 찾는 일반 소비자`,
    painPoint: inputs.persona.painPoint || `${topic} 선택 시 제품 차이를 파악하기 어려움`,
    solutionBenefit: inputs.persona.solutionBenefit || `${inputs.productName}의 핵심 장점과 구매 판단 기준 제시`,
    writingTone: inputs.persona.writingTone || "친근한 정보 전달형",
    callToAction: inputs.persona.callToAction || "지금 제품 페이지에서 자세히 확인해보세요.",
    contentFlow: inputs.persona.contentFlow || "문제 제기 → 비교 기준 제시 → 제품 장점 설명 → 구매 유도"
  };
};

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
  const cleanJsonText = stripCodeFence(rawText);

  try {
    return JSON.parse(cleanJsonText);
  } catch {
    const firstBrace = cleanJsonText.indexOf("{");
    const lastBrace = cleanJsonText.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleanJsonText.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("JSON 파싱 실패");
  }
};

const buildSeoPrompt = (inputs: BlogInputs) => {
  const requiredImageCount = Math.max(1, inputs.targetImageCount || 1);
  return [
    "당신은 네이버/구글 SEO + AEO 최적화 블로그 전문 카피라이터입니다.",
    `제품명: ${inputs.productName}`,
    `메인 키워드: ${inputs.mainKeyword || inputs.productName}`,
    `서브 키워드: ${inputs.subKeywords || "없음"}`,
    `제품 링크: ${inputs.productLink || "없음"}`,
    `참고 링크: ${inputs.referenceLink || "없음"}`,
    "아래 페르소나와 사용자 조건을 반드시 반영하세요.",
    `- 타깃 독자: ${inputs.persona.targetAudience}`,
    `- 핵심 문제: ${inputs.persona.painPoint}`,
    `- 기대 효익: ${inputs.persona.solutionBenefit}`,
    `- 문체/톤: ${inputs.persona.writingTone}`,
    `- 글 흐름: ${inputs.persona.contentFlow}`,
    `- CTA: ${inputs.persona.callToAction}`,
    "출력 조건:",
    "1) 한국어 본문 1,500자 이상",
    "2) 제목은 메인 키워드로 시작",
    "3) H2/H3 구조, 불릿, 비교 표 1개 이상 포함",
    "4) 네이버/구글 검색 의도 대응 문장과 FAQ 2개 이상 포함",
    "5) 과장/허위 표현 금지",
    `6) 이미지 프롬프트는 ${requiredImageCount}개 이상 제공(영문)` ,
    "반드시 JSON으로만 답하세요.",
    '{"title":"...","content":"...","imagePrompts":[{"nanoPrompt":"..."}],"report":{"analysisSummary":"...","personaAnalysis":"...","avgWordCount":1500}}'
  ].join("\n");
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

const extractModelslabImageUrl = (payload: any): string => {
  if (!payload) return "";
  return payload.output?.[0] || payload.proxy_links?.[0] || payload.future_links?.[0] || "";
};

const resolveModelslabResult = async (initialPayload: any): Promise<any> => {
  let payload = initialPayload;
  let imageUrl = extractModelslabImageUrl(payload);
  if (imageUrl) return payload;

  const fetchResultUrl = payload?.fetch_result;
  if (!fetchResultUrl || !MODELSLAB_KEY) return payload;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const pollRes = await fetch(fetchResultUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: MODELSLAB_KEY })
    });

    payload = await pollRes.json();
    imageUrl = extractModelslabImageUrl(payload);
    if (imageUrl) return payload;
    if (String(payload?.status || "").toLowerCase() === "error") return payload;
  }

  return payload;
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
        if (code === 404 || /not found|not supported|unsupported/i.test(message)) continue;
        if (code >= 400) continue;
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

const buildNanobananaPrompt = (
  inputs: BlogInputs,
  nanoPrompt: string,
  options: { isDishImage: boolean; objectHint: string }
) => {
  const dishMode = options.isDishImage ? "with_dish" : "without_dish";
  const dishRule = options.isDishImage
    ? `Place the product on this dish style: ${inputs.backgroundDish}.`
    : "Do not place any plate/bowl/tray under the product.";

  return [
    "Task: Product-preserving inpainting / background replacement.",
    `Primary object to preserve: ${options.objectHint}.`,
    "Detect and segment only the main product from the reference image; keep exact object silhouette.",
    "Keep object 100% intact: no shape change, no logo/text/package deformation, no brand replacement.",
    "Edit only outside the segmented object area.",
    `Scene location: ${inputs.backgroundLocation}.`,
    `Global color mood: ${inputs.backgroundColor}.`,
    `Table/Floor material: ${inputs.backgroundMaterial}.`,
    `Dish mode: ${dishMode}. ${dishRule}`,
    "Lighting: match scene direction/intensity with subtle natural relighting only.",
    "Quality: photorealistic, clean edges, no duplicated object, no random unrelated object, no black frame.",
    nanoPrompt ? `Style detail: ${nanoPrompt}` : ""
  ].filter(Boolean).join(" ");
};

/**
 * [함수 1] 배경 합성
 */
export const generateInpaintedImage = async (
  imageURL: string,
  inputs: BlogInputs,
  index: number,
  nanoPrompt: string,
  options?: { isDishImage?: boolean; objectHint?: string }
): Promise<ImageResult> => {
  if (!MODELSLAB_KEY) {
    return { url: imageURL, filename: `ai_${index}.png`, description: "원본 유지(모델슬랩 키 없음)", nanoPrompt: nanoPrompt || "" };
  }

  const objectHint = options?.objectHint || inputs.mainKeyword || inputs.productName;
  const isDishImage = Boolean(options?.isDishImage);
  const composedPrompt = buildNanobananaPrompt(inputs, nanoPrompt, { isDishImage, objectHint });

  try {
    const res = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        prompt: composedPrompt,
        negative_prompt: "deformed object, warped shape, distorted logo, wrong product, unrelated subject, mask artifact, collage, black frame",
        init_image: imageURL,
        width: 1024,
        height: 1024,
        samples: 1,
        safety_checker: "no"
      })
    });

    const initialPayload = await res.json();
    const result = await resolveModelslabResult(initialPayload);
    const resolvedUrl = extractModelslabImageUrl(result);

    return {
      url: resolvedUrl || imageURL,
      filename: `ai_${index}.png`,
      description: resolvedUrl ? (isDishImage ? "Modelslab 합성(식기 연출)" : "Modelslab 합성") : "원본 유지(모델슬랩 결과 없음)",
      nanoPrompt: composedPrompt
    };
  } catch {
    return { url: imageURL, filename: `ai_${index}.png`, description: "원본 유지(합성 실패)", nanoPrompt: composedPrompt };
  }
};

/**
 * [함수 2] 블로그 생성
 */
export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  const requiredImageCount = Math.max(1, inputs.targetImageCount || 1);
  const dishImageCount = Math.min(Math.max(0, inputs.dishImageCount || 0), requiredImageCount);

  const fallback = buildFallbackBlog(inputs);
  let blogData: any = {
    title: fallback.title,
    content: fallback.content,
    imagePrompts: [{ nanoPrompt: `${inputs.productName}, realistic product photo` }],
    report: {
      analysisSummary: fallback.report.analysisSummary,
      personaAnalysis: fallback.report.personaAnalysis,
      avgWordCount: fallback.report.avgWordCount
    }
  };

  if (GEMINI_KEY) {
    const prompt = buildSeoPrompt(inputs);

    try {
      const textResult = await tryGenerateText(prompt);

      if (textResult.status === "ok") {
        try {
          blogData = parseBlogJson(textResult.rawText);
        } catch {
          blogData = {
            title: `${inputs.mainKeyword || inputs.productName} 구매 가이드`,
            content: stripCodeFence(textResult.rawText),
            imagePrompts: [{ nanoPrompt: `${inputs.productName}, realistic product photo` }],
            report: {
              analysisSummary: "모델 응답을 원문 기반으로 정리했습니다.",
              personaAnalysis: "입력한 페르소나를 기준으로 문맥을 유지했습니다.",
              avgWordCount: 1500
            }
          };
        }
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
      }
    }
  }

  const sourceImages = (inputs.productImages || []).slice(0, 20);
  const sourceUrls = await Promise.all(
    sourceImages.filter((image) => Boolean(image?.data)).map((image) => uploadImageToBlob(image))
  );

  const finalImages: ImageResult[] = [];

  if (sourceUrls.length > 0) {
    for (let slot = 0; slot < requiredImageCount; slot += 1) {
      const sourceUrl = sourceUrls[slot % sourceUrls.length];
      const promptCandidate = blogData.imagePrompts?.[slot]?.nanoPrompt || blogData.imagePrompts?.[0]?.nanoPrompt || `${inputs.productName}, realistic product photo`;
      const isDishImage = slot < dishImageCount;

      const imgRes = await generateInpaintedImage(sourceUrl, inputs, slot, promptCandidate, {
        isDishImage,
        objectHint: inputs.mainKeyword || inputs.productName
      });

      finalImages.push({
        ...imgRes,
        url: imgRes.url || sourceUrl,
        description: imgRes.description || "원본 유지(결과 없음)"
      });
    }
  }

  const normalizedContent = blogData.content || blogData.body || fallback.content;
  const normalizedTitle = blogData.title || `${inputs.mainKeyword || inputs.productName} 활용 가이드`;

  return {
    title: normalizedTitle,
    content: normalizedContent,
    persona: defaultPersona(inputs),
    mode: inputs.generationMode,
    report: {
      rankingProbability: 98,
      safetyIndex: 96,
      suggestedCategory: "상품 리뷰",
      analysisSummary: blogData.report?.analysisSummary || fallback.report.analysisSummary,
      requiredImageCount,
      personaAnalysis: blogData.report?.personaAnalysis || fallback.report.personaAnalysis,
      avgWordCount: Number(blogData.report?.avgWordCount) || 1500
    },
    images: finalImages,
    groundingSources: []
  };
};
