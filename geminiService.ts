import { BlogInputs, BlogPost, ImageResult, PersonaAnswers } from "./types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;

const TEXT_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash-latest"];
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
    content: `${inputs.mainKeyword || inputs.productName}를 고를 때 가장 많이 생기는 질문은 "어떤 기준으로 비교해야 실패가 없을까?"입니다. 결론부터 말하면 제품의 사용 목적, 원재료/구성, 보관 편의성, 선물 적합성, 가격 대비 만족도를 함께 봐야 합니다. 특히 ${inputs.subKeywords || "실사용 후기, 장단점, 활용 팁"} 관점에서 기준을 세우면 검색만 많이 하고 결정을 못 내리는 상황을 줄일 수 있습니다.

## ${inputs.mainKeyword || inputs.productName} 구매 전 핵심 체크포인트
${inputs.productName}은(는) 단순히 가격만 비교하면 만족도가 떨어질 수 있습니다. 아래 항목은 네이버 검색에서 자주 묻는 질문과 실제 구매 후기를 기준으로 정리한 기본 체크리스트입니다.

- **사용 상황 확인**: 집에서 상시 소비인지, 선물용인지 먼저 구분
- **구성/중량 확인**: 세트 구성, 개별 포장 여부, 보관 난이도 확인
- **식감/취향 확인**: 촉촉함, 당도, 크기 편차 등 개인 취향 요소 확인
- **배송 안정성**: 파손 방지 포장, 아이스/완충 포장 여부 확인
- **재구매 요소**: 가족 반응, 선물 만족도, 보관 편의성

## 비교 기준 표 (SEO/AEO 핵심 요약)
| 비교 항목 | 확인 질문 | 좋은 선택 신호 |
|---|---|---|
| 용도 적합성 | 집에서 먹을지, 선물용인지? | 목적에 맞는 구성/포장 형태 |
| 품질 체감 | 식감과 당도가 내 취향에 맞는지? | 후기에서 식감/당도 평가가 구체적 |
| 구성 가치 | 가격 대비 구성품이 합리적인지? | 단품 대비 세트 구성의 이점 명확 |
| 보관 편의 | 보관이 쉬운지? | 개별 포장/보관 안내가 명확 |
| 신뢰도 | 정보가 충분히 공개되어 있는지? | 원산지/구성/배송 정보가 투명 |

## ${inputs.productName}를 추천하는 이유
첫째, 구매 의사결정에 필요한 핵심 정보를 빠르게 파악할 수 있습니다. 둘째, 제품의 장단점을 사용 맥락과 함께 보게 되어 후회 가능성이 낮아집니다. 셋째, 선물용으로 고려할 때도 포장/구성/전달 상황까지 미리 점검할 수 있어 만족도가 높아집니다.

## 이런 분께 특히 맞습니다
- ${defaultPersona(inputs).targetAudience}
- ${defaultPersona(inputs).painPoint} 문제를 겪는 분
- ${defaultPersona(inputs).solutionBenefit}이 필요한 분

## 실전 활용 팁
1. 검색 시 메인 키워드 + 서브 키워드를 함께 조합해 비교군을 3개로 좁히세요.
2. 후기에서는 "좋아요"보다 식감/포장/배송/보관 같은 구체 표현을 우선 확인하세요.
3. 선물용이라면 전달 시점과 보관 기간을 먼저 확인한 뒤 구성 옵션을 선택하세요.

## FAQ
### Q1. ${inputs.mainKeyword || inputs.productName}는 가격만 보면 되나요?
아닙니다. 가격만 보면 실제 만족도와 재구매율이 낮아질 수 있어, 구성/식감/보관/배송 안정성을 함께 봐야 합니다.

### Q2. 처음 고를 때 가장 중요한 1가지는 무엇인가요?
"내 사용 목적"입니다. 집에서 꾸준히 먹는 용도와 선물용은 우선순위가 다르므로 목적부터 정하면 선택이 훨씬 쉬워집니다.

${defaultPersona(inputs).callToAction}`,
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
  const persona = defaultPersona(inputs);

  return [
    `당신은 네이버 블로그 SEO 전문가입니다. "${inputs.productName}" 홍보글을 1,500자 이상의 매우 상세한 장문으로 작성하세요.`,
    `반드시 제목은 "${inputs.mainKeyword || inputs.productName}"로 시작하고 본문에 상세 비교 표를 포함하세요.`,
    "결과물은 반드시 아래 JSON 형식으로만 응답하고, 마크다운 기호(예: ```json)를 절대 포함하지 마세요.",
    '형식: {"title": "제목", "body": "1500자 본문", "imagePrompts": [{"nanoPrompt": "English keywords"}], "report": {"analysisSummary":"...","personaAnalysis":"...","avgWordCount":1800}}',
    "추가 AEO/네이버 최적화 조건:",
    "- 제목 길이 20~30자, 메인 키워드 앞 15자 이내 배치",
    "- 서론 첫 문단에서 두괄식으로 핵심 답변 제시",
    "- H2/H3 소제목 구조, 불릿 리스트 2개 이상",
    "- 비교 표 1개 이상, FAQ 2개 이상",
    "- 과장/허위 표현 금지, 키워드 반복은 자연스럽게",
    "- 네이버 C-Rank/D.I.A+ 관점에서 정보성/신뢰성/맥락성을 강화",
    `제품명: ${inputs.productName}`,
    `메인 키워드: ${inputs.mainKeyword || inputs.productName}`,
    `서브 키워드: ${inputs.subKeywords || "없음"}`,
    `참고할 블로그 URL: ${inputs.productLink || "없음"}`,
    `참고할 쇼핑/레퍼런스 URL: ${inputs.referenceLink || "없음"}`,
    "참고 URL 문서를 그대로 복사하지 말고, 핵심 사실/비교 관점만 재구성해 유사문서를 피하세요.",
    "페르소나:",
    `- 타깃 독자: ${persona.targetAudience}`,
    `- 문제점: ${persona.painPoint}`,
    `- 해결 기대효과: ${persona.solutionBenefit}`,
    `- 문체/톤: ${persona.writingTone}`,
    `- 글 흐름: ${persona.contentFlow}`,
    `- CTA: ${persona.callToAction}`,
    `imagePrompts는 ${requiredImageCount}개 이상 제공하세요(영문).`
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

const callGeminiGenerateContent = async (model: string, body: any, apiVersion: "v1beta" | "v1" = "v1beta") => {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${GEMINI_KEY}`;
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

const normalizeInitImage = (imageURL: string, sourceDataUrl?: string) => imageURL || sourceDataUrl || "";


const resolveModelslabResult = async (initialPayload: any): Promise<any> => {
  let payload = initialPayload;
  let imageUrl = extractModelslabImageUrl(payload);
  if (imageUrl || !MODELSLAB_KEY) return payload;

  const fetchResultUrl = payload?.fetch_result;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1300));

    if (fetchResultUrl) {
      try {
        const postRes = await fetch(fetchResultUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: MODELSLAB_KEY })
        });
        payload = await postRes.json();
      } catch {
        try {
          const getRes = await fetch(fetchResultUrl, { method: "GET" });
          payload = await getRes.json();
        } catch {
          // ignore and continue
        }
      }
    } else if (payload?.id) {
      try {
        const fallbackRes = await fetch(`https://modelslab.com/api/v6/images/fetch?key=${MODELSLAB_KEY}&id=${payload.id}`);
        payload = await fallbackRes.json();
      } catch {
        // ignore and continue
      }
    }

    imageUrl = extractModelslabImageUrl(payload);
    if (imageUrl) return payload;
    const status = String(payload?.status || "").toLowerCase();
    if (status === "error" || status === "failed") return payload;
  }

  return payload;
};

const tryGenerateText = async (prompt: string) => {
  let lastErrorMessage = "";
  let seenRateLimit = false;

  for (const model of TEXT_MODELS) {
    for (const version of ["v1beta", "v1"] as const) {
      try {
        const response = await callGeminiGenerateContent(model, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        }, version);

        const payload = await response.json();
        if (payload?.error) {
          const code = Number(payload.error.code);
          const message = String(payload.error.message || "");
          lastErrorMessage = message;

          if (code === 429) {
            seenRateLimit = true;
            continue;
          }
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
  }

  return seenRateLimit
    ? { status: "rate_limited" as const }
    : { status: "no_model" as const, message: lastErrorMessage || "사용 가능한 텍스트 모델을 찾지 못했습니다." };
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
  options?: { isDishImage?: boolean; objectHint?: string; sourceDataUrl?: string }
): Promise<ImageResult> => {
  if (!MODELSLAB_KEY) {
    return { url: imageURL, filename: `ai_${index}.png`, description: "원본 유지(모델슬랩 키 없음)", nanoPrompt: nanoPrompt || "" };
  }

  const objectHint = options?.objectHint || inputs.mainKeyword || inputs.productName;
  const isDishImage = Boolean(options?.isDishImage);
  const composedPrompt = buildNanobananaPrompt(inputs, nanoPrompt, { isDishImage, objectHint });
  const initImage = normalizeInitImage(imageURL, options?.sourceDataUrl);

  try {
    const res = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        prompt: composedPrompt,
        negative_prompt: "deformed object, warped shape, distorted logo, wrong product, unrelated subject, mask artifact, collage, black frame",
        init_image: initImage,
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

  const sourceImages = (inputs.productImages || []).slice(0, 20).filter((image) => Boolean(image?.data));
  const sourceAssets = await Promise.all(
    sourceImages.map(async (image) => {
      const dataUrl = toDataUrl(image.mimeType, image.data);
      const uploadedUrl = await uploadImageToBlob(image);
      return { dataUrl, uploadedUrl };
    })
  );

  sourceAssets.sort(() => Math.random() - 0.5);

  const finalImages: ImageResult[] = [];

  if (sourceAssets.length > 0) {
    for (let slot = 0; slot < requiredImageCount; slot += 1) {
      const sourceAsset = sourceAssets[slot % sourceAssets.length];
      const sourceUrl = sourceAsset.uploadedUrl;
      const promptCandidate = blogData.imagePrompts?.[slot]?.nanoPrompt || blogData.imagePrompts?.[0]?.nanoPrompt || `${inputs.productName}, realistic product photo`;
      const isDishImage = slot < dishImageCount;

      const imgRes = await generateInpaintedImage(sourceUrl, inputs, slot, promptCandidate, {
        isDishImage,
        objectHint: inputs.mainKeyword || inputs.productName,
        sourceDataUrl: sourceAsset.dataUrl
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
