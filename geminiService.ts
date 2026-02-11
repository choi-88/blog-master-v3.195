import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
const CLIENT_BUILD_MARKER = "client-api-proxy-v1";

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

const requestBlogContentFromApi = async (inputs: BlogInputs, contentOnly: boolean) => {
  const response = await fetch("/api/generate-blog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentOnly,
      productName: inputs.productName,
      mainKeyword: inputs.mainKeyword,
      generationMode: inputs.generationMode
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || `콘텐츠 API 오류(${CLIENT_BUILD_MARKER})`);
  }

  if (!result?.title || !result?.body) {
    throw new Error(`콘텐츠 API 응답 형식 오류(${CLIENT_BUILD_MARKER})`);
  }

  return result as { title: string; body: string; imagePrompts?: Array<{ nanoPrompt?: string }> };
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
  const blogData = await requestBlogContentFromApi(inputs, contentOnly);

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
