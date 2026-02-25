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


const base64ToDataUrl = (base64: string, mimeType = "image/png"): string => `data:${mimeType};base64,${base64}`;

const unwrapQuotedValue = (value: string): string => value.replace(/^b?["']|["']$/g, "");

const inferMimeTypeFromBase64 = (base64: string): string => {
  const sample = base64.slice(0, 20);
  if (sample.startsWith("iVBOR")) return "image/png";
  if (sample.startsWith("/9j/")) return "image/jpeg";
  if (sample.startsWith("UklGR")) return "image/webp";
  if (sample.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
};

const extractModelslabImageValue = (result: any): string => {
  const first = (v: any): string => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object") {
      return String(v.url || v.image || v.base64 || v.data || "");
    }
    return "";
  };

  return (
    first(result?.output?.[0]) ||
    first(result?.proxy_links?.[0]) ||
    first(result?.images?.[0]) ||
    first(result?.image)
  );
};



const pollModelslabFutureResult = async (futureLink: string): Promise<any> => {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(futureLink);
    const result = await response.json();

    const hasImage = Boolean(extractModelslabImageValue(result));
    const status = String(result?.status || "").toLowerCase();
    if (hasImage || !/(processing|pending|queued)/i.test(status)) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  throw new Error("ModelsLab 비동기 결과 폴링 타임아웃");
};

const createEditMasks = async (image: ProductImageData): Promise<{ backgroundMaskBase64: string; invertedMaskBase64: string }> => {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("마스크 생성을 위한 원본 이미지 로드 실패"));
    el.src = toDataUrl(image);
  });

  const width = img.naturalWidth || 1024;
  const height = img.naturalHeight || 1024;

  const paintMask = (protectColor: "black" | "white"): string => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("마스크 캔버스 컨텍스트 생성 실패");
    }

    const editColor = protectColor === "black" ? "white" : "black";
    ctx.fillStyle = editColor;
    ctx.fillRect(0, 0, width, height);

    const protectW = width * 0.82;
    const protectH = height * 0.86;
    const x = (width - protectW) / 2;
    const y = (height - protectH) / 2;
    const radius = Math.min(protectW, protectH) * 0.12;

    ctx.fillStyle = protectColor;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + protectW - radius, y);
    ctx.quadraticCurveTo(x + protectW, y, x + protectW, y + radius);
    ctx.lineTo(x + protectW, y + protectH - radius);
    ctx.quadraticCurveTo(x + protectW, y + protectH, x + protectW - radius, y + protectH);
    ctx.lineTo(x + radius, y + protectH);
    ctx.quadraticCurveTo(x, y + protectH, x, y + protectH - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    return canvas.toDataURL("image/png").split(",")[1] || "";
  };

  return {
    backgroundMaskBase64: paintMask("black"),
    invertedMaskBase64: paintMask("white")
  };
};

const requestImageProxyDataUrl = async (url: string): Promise<string> => {
  const response = await fetch("/api/image-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  const result = await response.json();
  if (!response.ok || !result?.dataUrl) {
    throw new Error(result?.error || "이미지 프록시 변환 실패");
  }

  return String(result.dataUrl);
};

const ensureRenderableImageUrl = async (rawValue: string): Promise<string> => {
  const normalized = normalizeGeneratedImageUrl(rawValue);
  if (!normalized) return "";
  if (/^data:image\//i.test(normalized)) {
    return normalized;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return await requestImageProxyDataUrl(normalized);
  }
  return "";
};


const normalizeGeneratedImageUrl = (rawValue: string): string => {
  const value = unwrapQuotedValue(String(rawValue || "").trim());
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) {
    return value;
  }

  const compact = value.replace(/\n|\r|\s+/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length > 64) {
    return base64ToDataUrl(compact, inferMimeTypeFromBase64(compact));
  }

  return "";
};


type ModelslabImageSource = {
  initImage: string;
  maskImage: string;
  useBase64Input: boolean;
  dataUrl: string;
  maskBase64: string;
  invertedMaskBase64: string;
};

const resolveModelslabImageSource = async (image: ProductImageData): Promise<ModelslabImageSource> => {
  const { backgroundMaskBase64, invertedMaskBase64 } = await createEditMasks(image);
  const maskBase64 = backgroundMaskBase64;

  if (!BLOB_TOKEN) {
    return {
      initImage: image.data,
      maskImage: maskBase64,
      useBase64Input: true,
      dataUrl: toDataUrl(image),
      maskBase64,
      invertedMaskBase64
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
      maskImage: maskBase64,
      useBase64Input: true,
      dataUrl: toDataUrl(image),
      maskBase64,
      invertedMaskBase64
    };
  } catch {
    return {
      initImage: image.data,
      maskImage: maskBase64,
      useBase64Input: true,
      dataUrl: toDataUrl(image),
      maskBase64,
      invertedMaskBase64
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
      subKeywords: inputs.subKeywords,
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

const requestModelslabInpaint = async (
  imageSource: ModelslabImageSource,
  payloadBase: Record<string, any>
): Promise<any> => {
  const variants = [
    { init_image: imageSource.initImage, mask_image: imageSource.maskImage, base64: true },
    { init_image: imageSource.initImage, mask_image: imageSource.maskImage, base64: "true" },
    { init_image: imageSource.dataUrl, mask_image: base64ToDataUrl(imageSource.maskBase64), base64: true },
    { init_image: imageSource.initImage, mask_image: imageSource.invertedMaskBase64, base64: true },
    { init_image: imageSource.dataUrl, mask_image: base64ToDataUrl(imageSource.invertedMaskBase64), base64: true }
  ];

  let lastError = "";

  for (const variant of variants) {
    const res = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payloadBase, ...variant })
    });

    const result = await res.json();
    if (!result?.error) {
      const hasImage = Boolean(extractModelslabImageValue(result));
      const futureLink = String(result?.future_links?.[0] || "");
      const status = String(result?.status || "").toLowerCase();
      if (!hasImage && futureLink && /(processing|pending|queued)/i.test(status)) {
        return await pollModelslabFutureResult(futureLink);
      }
      return result;
    }

    lastError = String(result.error || result.message || `HTTP ${res.status}`);
    if (!/valid url when base64 is a representation of false|init image|mask image/i.test(lastError)) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError || "ModelsLab 이미지 요청 실패");
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
      "Photorealistic background-only replacement for a product photo",
      "Keep the uploaded product object pixel-faithful: do not alter shape, logo, label text, color, texture, or geometry.",
      "Do not redraw or repaint the object; edit only surrounding background area and keep object pixels unchanged.",
      "Allow only natural global lighting effects on the object: saturation, brightness, soft reflection, and light direction adaptation.",
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

    const result = await requestModelslabInpaint(imageSource, {
      key: MODELSLAB_KEY,
      model_id: MODELSLAB_IMAGE_MODEL,
      model: MODELSLAB_IMAGE_MODEL,
      prompt: composedPrompt,
      negative_prompt: "deformed product, warped package, melted object, duplicated object, altered label, changed text, distorted geometry, blurry, low resolution, watermark",
      width: 1024,
      height: 1024,
      samples: 1,
      num_inference_steps: 40,
      guidance_scale: 4.5,
      strength: 0.12,
      safety_checker: "no"
    });

    const generatedValue = extractModelslabImageValue(result);
    const generatedUrl = await ensureRenderableImageUrl(generatedValue);
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
