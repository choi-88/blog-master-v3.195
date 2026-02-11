// geminiService.ts
import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// ====== 1) 공통 유틸 ======
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * ✅ 텍스트는 Google AI Studio (Gemini 1.5 Flash) 서버 함수로만 호출
 * - 프론트에서 Gemini API 직접 호출 금지(CORS/키노출)
 * - 중국 프록시(openai.apikey.run) 완전 제거
 */
const callGeminiJson = async (systemInstruction: string, userPrompt: string) => {
  const res = await fetch("/api/gemini-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction, userPrompt }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  // gemini-text.ts에서 responseMimeType을 application/json으로 강제해야 안정적
  return JSON.parse(text);
};

// ====== 2) 이미지 생성/인페인팅 (ModelsLab 서버 함수 호출) ======
export const generateImage = async (
  prompt: string,
  filenameBase: string
): Promise<ImageResult> => {
  const res = await fetch("/api/modelslab-text2img", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, width: 1024, height: 1024, steps: 30 }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  const json = JSON.parse(text);
  const url = json?.output?.[0];
  if (!url) throw new Error("ModelsLab output url missing");

  return {
    url,
    filename: `${filenameBase}.png`,
    description: prompt,
    nanoPrompt: prompt,
  };
};

export const inpaintImage = async (
  prompt: string,
  imageDataUrl: string,
  maskDataUrl: string,
  filenameBase: string
): Promise<ImageResult> => {
  const res = await fetch("/api/modelslab-inpaint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, imageDataUrl, maskDataUrl }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  const json = JSON.parse(text);
  const url = json?.output?.[0];
  if (!url) throw new Error("ModelsLab inpaint output url missing");

  return {
    url,
    filename: `${filenameBase}.png`,
    description: prompt,
    nanoPrompt: prompt,
  };
};

/**
 * [기능 1] 배경교체(인페인팅) 파이프라인용 (기존 함수명 유지)
 * - 현재는 generateImage() 기반 프롬프트 방식
 * - "진짜 인페인팅(원본 유지 + 마스크)"을 쓰려면 inpaintImage()를 UI/로직에서 호출해야 함
 */
export const generateInpaintedImage = async (
  originalImage: ProductImageData,
  backgroundLocation: string,
  backgroundColor: string,
  backgroundMaterial: string,
  backgroundDish: string,
  imgReq: { nanoPrompt: string; description: string },
  index: number,
  mainKeyword: string,
  globalBackgroundDNA: string
): Promise<ImageResult> => {
  try {
    const filenameBase = `${mainKeyword.replace(/[^\w가-힣]/g, "_")}_${index + 1}`;

    const prompt = [
      `Realistic product photo (e-commerce style).`,
      `Scene: "${backgroundLocation}" on "${backgroundMaterial}".`,
      `Palette: "${backgroundColor}".`,
      `Dish/Prop: "${backgroundDish}".`,
      `DNA: ${globalBackgroundDNA}.`,
      `Product: "${mainKeyword}".`,
      `Detail: ${imgReq.nanoPrompt}.`,
      `High detail, natural lighting, sharp focus, no text, no watermark.`,
    ].join(" ");

    const img = await generateImage(prompt, filenameBase);

    return {
      ...img,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt,
    };
  } catch {
    return {
      url: "",
      filename: `failed_${index}.png`,
      description: "실패",
      nanoPrompt: "",
    };
  }
};

// ====== 3) 블로그 생성 (텍스트: Gemini 1.5 Flash) ======
export const generateBlogSystem = async (
  inputs: BlogInputs,
  skipImages: boolean = false
): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === "IMAGE_ONLY";

  const systemInstruction = `당신은 네이버 블로그 SEO 전문가입니다.
- 제목: 메인 키워드("${inputs.mainKeyword}")를 제목 가장 처음에 배치.
- 본문: 첫 150자 이내에 결론(Answer-First) 배치 및 1500자 이상의 글 생성.
- 표(Table) 필수 사용.
- 별표(*) 금지.
- 반드시 JSON만 출력하세요. (설명/코드블록 금지)`;

  try {
    // ✅ 텍스트는 Gemini 서버 함수로만 생성
    const rawData = await callGeminiJson(
      systemInstruction,
      `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: JSON만`
    );

    const dna = rawData?.globalBackgroundDNA || "Realistic snapshot";

    // 2) 이미지 생성
    let finalImages: ImageResult[] = [];

    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgReq = rawData?.imagePrompts?.[idx] || {
          nanoPrompt: "Natural, clean, realistic product photo",
          description: `설명 ${idx + 1}`,
        };

        const imgIdx = inputs.productImages?.length ? idx % inputs.productImages.length : 0;
        const original = inputs.productImages?.[imgIdx];

        const dish = idx < inputs.dishImageCount ? inputs.backgroundDish : "surface";

        const imgRes = await generateInpaintedImage(
          original,
          inputs.backgroundLocation,
          inputs.backgroundColor,
          inputs.backgroundMaterial,
          dish,
          imgReq,
          idx,
          inputs.mainKeyword || inputs.productName,
          dna
        );

        if (imgRes.url) finalImages.push(imgRes);

        if (idx < inputs.targetImageCount - 1) await sleep(3000);
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 결과` : rawData?.title,
      content: isImageOnly ? "완료" : rawData?.body,
      persona: rawData?.persona,
      mode: inputs.generationMode,
      report: rawData?.report,
      images: finalImages,
      groundingSources: [],
    };
  } catch (e: any) {
    throw new Error(`생성 실패: ${e?.message || String(e)}`);
  }
};
