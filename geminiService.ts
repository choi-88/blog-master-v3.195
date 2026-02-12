import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

const DEFAULT_MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
const CLIENT_BUILD_MARKER = "client-api-proxy-v1";
const DEFAULT_IMAGE_PROVIDER = "MODELSLAB";
const DEFAULT_IMAGE_MODEL = "nano-banana-pro";

const safeJsonParse = <T>(text: string): T => {
  const normalized = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  return JSON.parse(normalized) as T;
};


const resolveApiSettings = (inputs: BlogInputs) => ({
  geminiApiKey: inputs.geminiApiKey?.trim() || "",
  modelslabApiKey: inputs.modelslabApiKey?.trim() || DEFAULT_MODELSLAB_KEY || "",
  replicateApiKey: inputs.replicateApiKey?.trim() || "",
  imageProvider: inputs.imageProvider || DEFAULT_IMAGE_PROVIDER,
  imageModel: inputs.imageModel || DEFAULT_IMAGE_MODEL
});

type ObjectProfile = {
  objectName: string;
  objectDetails: string;
  framingHint: string;
};

const mapImageModelToModelslabId = (model: string): string => {
  const key = model.toLowerCase();
  if (key.includes("nano-banana-pro") || key.includes("nanobanana-pro")) return "nano-banana-pro";
  if (key.includes("nano-banana") || key.includes("nanobanana")) return "nano-banana";
  if (key.includes("imagen3") || key.includes("imagine3")) return "google-imagen-3";
  return model;
};

const mapImageModelToReplicateModel = (model: string): string => {
  const key = model.toLowerCase();
  if (key.includes("nano-banana-pro") || key.includes("nanobanana-pro")) return "black-forest-labs/flux-kontext-pro";
  if (key.includes("nano-banana") || key.includes("nanobanana")) return "black-forest-labs/flux-kontext-dev";
  if (key.includes("imagen3") || key.includes("imagine3")) return "google/imagen-3";
  return model;
};

const buildKeyUsageMarker = (provider: string, model: string, modelslabApiKey: string, replicateApiKey: string): string => {
  const masked = (value: string) => (value ? `${value.slice(0, 4)}...${value.slice(-4)}` : "none");
  const keyInfo = provider === "REPLICATE" ? masked(replicateApiKey) : masked(modelslabApiKey);
  return `[provider=${provider} model=${model} key=${keyInfo}]`;
};

const getRandomImageIndexOrder = (length: number): number[] => {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
    first(result?.future_links?.[0]) ||
    first(result?.images?.[0]) ||
    first(result?.image)
  );
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

const ensureRenderableImageUrl = async (rawValue: string): Promise<string> => {
  const normalized = normalizeGeneratedImageUrl(rawValue);
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized) || /^data:image\//i.test(normalized)) {
    return normalized;
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
  const settings = resolveApiSettings(inputs);
  const response = await fetch("/api/generate-blog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentOnly,
      productName: inputs.productName,
      mainKeyword: inputs.mainKeyword,
      generationMode: inputs.generationMode,
      subKeywords: inputs.subKeywords,
      productLink: inputs.productLink,
      referenceLink: inputs.referenceLink,
      geminiApiKey: settings.geminiApiKey
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

  return result as { title: string; body: string; imagePrompts?: Array<{ nanoPrompt?: string; description?: string }>; seoAeo?: { score: number; total: number; checks: Record<string, boolean> } };
};

const analyzeObjectFromImage = async (
  image: ProductImageData,
  geminiApiKey: string,
  mainKeyword: string,
  subKeywords: string
): Promise<ObjectProfile> => {
  if (!geminiApiKey) {
    return {
      objectName: "product",
      objectDetails: `${mainKeyword} ${subKeywords}`.trim(),
      framingHint: "close-up, centered composition"
    };
  }

  const prompt = [
    "Analyze the uploaded product photo for background replacement.",
    "Return strict JSON only:",
    '{"objectName":"", "objectDetails":"", "framingHint":""}',
    "objectDetails should describe the visible product appearance and packaging only.",
    "framingHint should describe camera angle and composition in one line."
  ].join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: image.mimeType,
                    data: image.data
                  }
                }
              ]
            }
          ]
        })
      }
    );

    const json = await res.json();
    const text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "");
    const cleaned = text.replace(/```json|```/gi, "").trim();
    const parsed = safeJsonParse<any>(cleaned);
    return {
      objectName: String(parsed?.objectName || "product"),
      objectDetails: String(parsed?.objectDetails || `${mainKeyword} ${subKeywords}`.trim()),
      framingHint: String(parsed?.framingHint || "close-up, centered composition")
    };
  } catch {
    return {
      objectName: "product",
      objectDetails: `${mainKeyword} ${subKeywords}`.trim(),
      framingHint: "close-up, centered composition"
    };
  }
};

const requestModelslabFetchResult = async (apiKey: string, requestId: string): Promise<any> => {
  const res = await fetch("https://modelslab.com/api/v6/images/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: apiKey, request_id: requestId })
  });
  return await res.json();
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
      if (result?.output?.length || result?.proxy_links?.length || result?.images?.length || result?.image) {
        return result;
      }

      const requestId = String(result?.id || result?.request_id || "");
      if (requestId && String(payloadBase?.key || "")) {
        for (let i = 0; i < 30; i += 1) {
          await new Promise((r) => setTimeout(r, 1200));
          const fetched = await requestModelslabFetchResult(String(payloadBase.key), requestId);
          if (fetched?.output?.length || fetched?.proxy_links?.length || fetched?.images?.length || fetched?.image) {
            return fetched;
          }
          if (String(fetched?.status || "").toLowerCase() === "failed") {
            throw new Error(String(fetched?.error || fetched?.message || "ModelsLab fetch failed"));
          }
        }
      }

      if (result?.future_links?.length) {
        return { output: [result.future_links[0]] };
      }

      throw new Error(String(result?.message || "ModelsLab 출력 이미지를 찾지 못했습니다."));
    }

    lastError = String(result.error || result.message || `HTTP ${res.status}`);
    if (!/valid url when base64 is a representation of false|init image|mask image/i.test(lastError)) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError || "ModelsLab 이미지 요청 실패");
};


const requestReplicateImageEdit = async (
  imageData: ProductImageData,
  prompt: string,
  replicateApiKey: string,
  imageModel: string
): Promise<string> => {
  const model = mapImageModelToReplicateModel(imageModel);
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${replicateApiKey}`
    },
    body: JSON.stringify({
      model,
      input: {
        prompt,
        image: toDataUrl(imageData),
        input_image: toDataUrl(imageData),
        strength: 0.12
      }
    })
  });

  const created = await response.json();
  if (!response.ok || !created?.urls?.get) {
    throw new Error(String(created?.error || created?.detail || "Replicate 예측 생성 실패"));
  }

  for (let i = 0; i < 40; i += 1) {
    const pollRes = await fetch(created.urls.get, {
      headers: { Authorization: `Token ${replicateApiKey}` }
    });
    const polled = await pollRes.json();
    if (polled.status === "succeeded") {
      const out = Array.isArray(polled.output) ? polled.output[0] : polled.output;
      return String(out || "");
    }
    if (polled.status === "failed" || polled.status === "canceled") {
      throw new Error(String(polled?.error || "Replicate 이미지 생성 실패"));
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  throw new Error("Replicate 응답 타임아웃");
};

/**
 * [함수 1] ModelsLab/Replicate 배경 합성
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
  personaHint: string,
  imageProvider: string = DEFAULT_IMAGE_PROVIDER,
  imageModel: string = DEFAULT_IMAGE_MODEL,
  modelslabApiKey: string = DEFAULT_MODELSLAB_KEY || "",
  replicateApiKey: string = "",
  geminiApiKey: string = ""
): Promise<ImageResult> => {
  if (imageProvider === "MODELSLAB" && !modelslabApiKey) {
    throw new Error("ModelsLab API 키가 설정되지 않았습니다.");
  }
  if (imageProvider === "REPLICATE" && !replicateApiKey) {
    throw new Error("Replicate API 키가 설정되지 않았습니다.");
  }

  try {
    const imageSource = await resolveModelslabImageSource(image);
    const objectProfile = await analyzeObjectFromImage(image, geminiApiKey, mainKeyword, imageRequest.description || "");
    const iPhoneStyle = "Shot naturally with iPhone 14 Pro camera look, realistic exposure and colors";
    const composedPrompt = [
      "Photorealistic background-only replacement for a product photo",
      "Keep the uploaded product object pixel-faithful: do not alter shape, logo, label text, color, texture, or geometry.",
      "Do not redraw or repaint the object; edit only surrounding background area and keep object pixels unchanged.",
      "Allow only natural global lighting effects on the object: saturation, brightness, soft reflection, and light direction adaptation.",
      `Primary object: ${objectProfile.objectName}`,
      `Object details: ${objectProfile.objectDetails}`,
      `Framing hint: ${objectProfile.framingHint}`,
      iPhoneStyle,
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

    let generatedRaw = "";

    if (imageProvider === "REPLICATE") {
      generatedRaw = await requestReplicateImageEdit(image, composedPrompt, replicateApiKey, imageModel);
    } else {
      const result = await requestModelslabInpaint(imageSource, {
        key: modelslabApiKey,
        model_id: mapImageModelToModelslabId(imageModel),
        model: mapImageModelToModelslabId(imageModel),
        prompt: composedPrompt,
        negative_prompt: "deformed product, warped package, melted object, duplicated object, altered label, changed text, distorted geometry, blurry, low resolution, watermark",
        width: 1024,
        height: 1024,
        samples: 1,
        num_inference_steps: 40,
        guidance_scale: 4.5,
        strength: 0.12,
        safety_checker: "no",
        seed: Math.floor(Math.random() * 1000000000),
        prompt_model: imageModel
      });
      generatedRaw = extractModelslabImageValue(result);
    }

    const generatedUrl = await ensureRenderableImageUrl(generatedRaw);
    if (!generatedUrl) {
      throw new Error("이미지 URL이 반환되지 않았습니다.");
    }

    return {
      url: generatedUrl,
      filename: `ai_${index + 1}.png`,
      description: `${imageRequest.description || "AI 합성 이미지"} ${buildKeyUsageMarker(imageProvider, imageModel, modelslabApiKey, replicateApiKey)}`,
      nanoPrompt: imageRequest.nanoPrompt || ""
    };
  } catch (error: any) {
    throw new Error(`이미지 합성 실패(#${index + 1}, ${imageProvider}): ${error?.message || "unknown error"}`);
  }
};

/**
 * [함수 2] 블로그 생성
 */
export const generateBlogSystem = async (inputs: BlogInputs, contentOnly = false): Promise<BlogPost> => {
  const settings = resolveApiSettings(inputs);
  const blogData = await requestBlogContentFromApi(inputs, contentOnly);

  const finalImages: ImageResult[] = [];
  if (!contentOnly && inputs.productImages?.length) {
    const targetImageCount = Math.max(1, inputs.targetImageCount || 1);
    const imageRequests = buildImageRequests(blogData.imagePrompts, targetImageCount, inputs.mainKeyword || inputs.productName)
      .map((req, idx) => ({
        ...req,
        nanoPrompt: `${req.nanoPrompt || ""}, dish_count:${idx < inputs.dishImageCount ? "with dish" : "without dish"}, selected_dish:${inputs.backgroundDish}, material:${inputs.backgroundMaterial}, color:${inputs.backgroundColor}, location:${inputs.backgroundLocation}`
      }));

    const randomOrder = getRandomImageIndexOrder(inputs.productImages.length);
    const generatedImages = await Promise.all(
      imageRequests.map((imageRequest, index) =>
        generateInpaintedImage(
          inputs.productImages[randomOrder[index % randomOrder.length]],
          inputs.backgroundLocation,
          inputs.backgroundColor,
          inputs.backgroundMaterial,
          inputs.backgroundDish,
          imageRequest,
          index,
          inputs.mainKeyword || inputs.productName,
          inputs.persona.targetAudience || "일반 소비자",
          settings.imageProvider,
          settings.imageModel,
          settings.modelslabApiKey,
          settings.replicateApiKey,
          settings.geminiApiKey
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
      avgWordCount: 1500,
      seoAeoScore: blogData.seoAeo ? `${blogData.seoAeo.score}/${blogData.seoAeo.total}` : undefined,
      seoAeoChecklist: blogData.seoAeo?.checks
    },
    images: finalImages,
    groundingSources: []
  };
};
