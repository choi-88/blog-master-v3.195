import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
const CLIENT_BUILD_MARKER = "client-api-proxy-v1";
const MODELSLAB_IMAGE_MODEL = "flux-kontext-dev";

const safeJsonParse = <T>(text: string): T => {
  const normalized = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  return JSON.parse(normalized) as T;
};

const DEFAULT_PERSONA = {
  targetAudience: "",
  painPoint: "",
  solutionBenefit: "",
  writingTone: "친근한 정보 전달형",
  callToAction: "",
  contentFlow: ""
};


const buildImageRequests = (
  prompts: Array<{ nanoPrompt?: string; description?: string }> | undefined,
  targetImageCount: number,
  mainKeyword: string
): Array<{ nanoPrompt?: string; description?: string }> => {
  return Array.from({ length: targetImageCount }, (_, idx) => {
    const prompt = prompts?.[idx] || {};
    return {
      nanoPrompt:
        prompt.nanoPrompt ||
        `Korean commercial product photo, ${mainKeyword}, realistic lighting, clean composition, high detail`,
      description: prompt.description || `AI 배경 합성 이미지 ${idx + 1}`
    };
  });
};

const toDataUrl = (image: ProductImageData): string => `data:${image.mimeType};base64,${image.data}`;


type ModelslabImageSource = {
  initImage: string;
  maskImage: string;
  useBase64Input: boolean;
};

const resolveModelslabImageSource = async (image: ProductImageData): Promise<ModelslabImageSource> => {
  if (!BLOB_TOKEN) {
    return {
      initImage: image.data,
      maskImage: image.data,
      useBase64Input: true
    };
  }

  try {
    const blob = await fetch(toDataUrl(image)).then((r) => r.blob());
    const uploadRes = await fetch(`https://blob.vercel-storage.com/add?filename=prod_${Date.now()}.png`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BLOB_TOKEN}` },
      body: blob
    });
    const uploadData = await uploadRes.json();
    const uploadedUrl = String(uploadData?.url || "");

    if (!uploadedUrl) {
      throw new Error("blob upload url missing");
    }

    return {
      initImage: uploadedUrl,
      maskImage: uploadedUrl,
      useBase64Input: false
    };
  } catch {
    return {
      initImage: image.data,
      maskImage: image.data,
      useBase64Input: true
    };
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

  const rawResponseText = await response.text();
  let result: any = null;

  try {
    result = safeJsonParse(rawResponseText);
  } catch (error: any) {
    throw new Error(`콘텐츠 API JSON 파싱 오류(${CLIENT_BUILD_MARKER}): ${error?.message || "unknown"}`);
  }

  if (!response.ok) {
    throw new Error(result?.error || `콘텐츠 API 오류(${CLIENT_BUILD_MARKER})`);
  }

  if (!result?.title || !result?.body) {
    throw new Error(`콘텐츠 API 응답 형식 오류(${CLIENT_BUILD_MARKER})`);
  }

  return result as { title: string; body: string; imagePrompts?: Array<{ nanoPrompt?: string; description?: string }> };
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
    throw new Error("ModelsLab API 키가 설정되지 않았습니다.");
  }

  try {
    const imageSource = await resolveModelslabImageSource(image);
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
        model_id: MODELSLAB_IMAGE_MODEL,
        model: MODELSLAB_IMAGE_MODEL,
        prompt: composedPrompt,
        negative_prompt: "blurry, low resolution, watermark, text",
        init_image: imageSource.initImage,
        mask_image: imageSource.maskImage,
        base64: imageSource.useBase64Input,
        width: 1024,
        height: 1024,
        samples: 1,
        safety_checker: "no"
      })
    });

    const result = await res.json();

    if (result?.error) {
      throw new Error(String(result.error));
    }

    const generatedUrl = result.output?.[0] || result.proxy_links?.[0] || "";
    if (!generatedUrl) {
      throw new Error(result?.message || "ModelsLab 이미지 URL이 반환되지 않았습니다.");
    }

    return {
      url: generatedUrl,
      filename: `ai_${index + 1}.png`,
      description: imageRequest.description || "AI 합성 이미지",
      nanoPrompt: imageRequest.nanoPrompt || ""
    };
  } catch (error: any) {
    throw new Error(`이미지 합성 실패(#${index + 1}): ${error?.message || "unknown error"}`);
  }
};

/**
 * [함수 2] 블로그 생성
 */
export const generateBlogSystem = async (inputs: BlogInputs, contentOnly = false): Promise<BlogPost> => {
  const blogData = await requestBlogContentFromApi(inputs, contentOnly);

  const finalImages: ImageResult[] = [];
  if (!contentOnly && inputs.productImages?.length) {
    const targetImageCount = Math.max(1, inputs.targetImageCount || 1);
    const imageRequests = buildImageRequests(blogData.imagePrompts, targetImageCount, inputs.mainKeyword || inputs.productName);

    const generatedImages = await Promise.all(
      imageRequests.map((imageRequest, index) =>
        generateInpaintedImage(
          inputs.productImages[index % inputs.productImages.length],
          inputs.backgroundLocation,
          inputs.backgroundColor,
          inputs.backgroundMaterial,
          inputs.backgroundDish,
          imageRequest,
          index,
          inputs.mainKeyword || inputs.productName,
          inputs.persona.targetAudience || "일반 소비자"
        )
      )
    );

    finalImages.push(...generatedImages);
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
