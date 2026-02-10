// geminiService.ts
import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

/**
 * ✅ 이 파일은 네가 준 코드에 내가 제안한 수정사항을 "전부" 반영한 최종본이야.
 *
 * 핵심 변경점:
 * 1) URL(엔드포인트)와 KEY를 섞어 쓰는 로직 제거 (url을 key로 넣는 버그 제거)
 * 2) 텍스트는 /v1/chat/completions 포맷, 이미지는 /v1/images/generations 포맷으로 완전 분리
 * 3) Authorization 헤더는 "키가 있을 때만" 붙이도록 안전 처리
 * 4) 텍스트는 response_format(json_object)로 JSON 강제 → 파싱 실패 방지
 * 5) 이미지 응답은 data[0].b64_json 또는 data[0].url 둘 다 처리
 *
 * ⚠️ 참고(중요):
 * - 현재 너가 가진 이미지 엔드포인트는 /images/generations 이므로 "진짜 인페인팅(원본 유지+배경교체)"는 구조적으로 불가.
 * - 그래서 generateInpaintedImage()는 이름만 유지하고, 내부적으로는 "프롬프트 기반 이미지 생성"으로 동작하게 했어.
 */

// ====== 1) 환경 변수 / 엔드포인트 ======
const API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY || "").trim(); // ✅ Bearer 키 1개만 사용

const TEXT_URL = "https://openai.apikey.run/v1/chat/completions";
const IMAGE_URL = "https://openai.apikey.run/v1/images/generations";

// 텍스트 모델(너가 쓰던 모델 유지)
const TEXT_MODEL_NAME = "gemini-2.0-flash";

// 이미지 모델: 프록시가 어떤 모델을 연결해놨는지에 따라 바꿔야 할 수 있음
// 1순위: gpt-image-1 / 2순위: dall-e-3 (둘 중 하나가 보통 작동)
const IMAGE_MODEL_NAME = "gpt-image-1";

// ====== 2) 공통 유틸 ======
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const makeHeaders = () => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["Authorization"] = `Bearer ${API_KEY}`;
  return h;
};

/** JSON 파싱: response_format을 쓰지만, 혹시라도 문자열로 오면 대비 */
const safeJsonParse = <T = any>(v: any): T => {
  if (v == null) throw new Error("빈 응답입니다.");
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      // JSON이 아닌 텍스트가 섞여올 경우 대비(최후의 수단)
      const startIdx = v.indexOf("{");
      const endIdx = v.lastIndexOf("}");
      if (startIdx === -1 || endIdx === -1) throw new Error("JSON 구조를 찾을 수 없습니다.");
      return JSON.parse(v.slice(startIdx, endIdx + 1)) as T;
    }
  }
  throw new Error("알 수 없는 응답 형식입니다.");
};

const ensureOkJson = async (res: Response) => {
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`API 실패: ${res.status} ${t}`);
  }
  return res.json();
};

// ====== 3) 이미지 생성 (images/generations) ======
export const generateImage = async (
  prompt: string,
  filenameBase: string
): Promise<ImageResult> => {
  const res = await fetch(IMAGE_URL, {
    method: "POST",
    headers: makeHeaders(),
    body: JSON.stringify({
      model: IMAGE_MODEL_NAME,
      prompt,
      n: 1,
      size: "1024x1024",
      // response_format: "b64_json", // 프록시에 따라 필요할 수 있음(필요 시 주석 해제)
    }),
  });

  const json = await ensureOkJson(res);

  const b64 = json?.data?.[0]?.b64_json;
  if (b64) {
    return {
      url: `data:image/png;base64,${b64}`,
      filename: `${filenameBase}.png`,
      description: prompt,
      nanoPrompt: prompt,
    };
  }

  const url = json?.data?.[0]?.url;
  if (url) {
    return {
      url,
      filename: `${filenameBase}.png`,
      description: prompt,
      nanoPrompt: prompt,
    };
  }

  throw new Error("이미지 응답에 b64_json/url이 없습니다.");
};

/**
 * [기능 1] 이미지 생성 (기존 함수명 유지)
 * ⚠️ /images/generations는 인페인팅이 아니라 새 이미지 생성이라서
 * 원본 이미지를 그대로 유지하는 "진짜 배경교체"는 불가.
 * - 원본 이미지는 프롬프트에 힌트로만 반영(설명용)
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

    // 원본 이미지 자체를 endpoint에 같이 보내 인페인팅하는 구조가 아니라,
    // 프롬프트로 "제품 사진처럼" 생성하도록 유도하는 방식
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

// ====== 4) 블로그 생성 (chat/completions) ======
export const generateBlogSystem = async (
  inputs: BlogInputs,
  skipImages: boolean = false
): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === "IMAGE_ONLY";

  const systemInstruction = `당신은 네이버 블로그 SEO 전문가입니다.
- 제목: 메인 키워드("${inputs.mainKeyword}")를 제목 가장 처음에 배치.
- 본문: 첫 150자 이내에 결론(Answer-First) 배치.
- 표(Table) 필수 사용.
- 별표(*) 금지.
- 반드시 JSON만 출력하세요. (설명/코드블록 금지)`;

  try {
    // 1) 텍스트 생성(무조건 JSON)
    const res = await fetch(TEXT_URL, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        model: TEXT_MODEL_NAME,
        messages: [
          { role: "system", content: systemInstruction },
          {
            role: "user",
            content: `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: JSON만`,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }, // ✅ JSON 강제
      }),
    });

    const result = await ensureOkJson(res);
    const content = result?.choices?.[0]?.message?.content;

    const rawData = safeJsonParse<any>(content);
    const dna = rawData?.globalBackgroundDNA || "Realistic snapshot";

    // 2) 이미지 생성
    let finalImages: ImageResult[] = [];

    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgReq = rawData?.imagePrompts?.[idx] || {
          nanoPrompt: "Natural, clean, realistic product photo",
          description: `설명 ${idx + 1}`,
        };

        // 기존 구조 유지: productImages는 인페인팅에 쓰이진 않지만, 시그니처 유지용으로 인자 전달
        const imgIdx = inputs.productImages?.length ? idx % inputs.productImages.length : 0;
        const original = inputs.productImages?.[imgIdx];

        // dishImageCount 기준 적용(기존 로직 유지)
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

        // 과도한 호출 방지용 지연(기존 5초 → 1.5초로 완화, 필요하면 다시 5초로)
        if (idx < inputs.targetImageCount - 1) await sleep(1500);
      }
    }

    // 3) 최종 반환
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
