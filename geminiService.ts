import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. API 설정 (Vercel 환경 변수에서 각각 가져오기)
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const TEXT_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; // 텍스트용 키
const IMAGE_API_KEY = import.meta.env.VITE_IMAGE_API_KEY;    // 💡 새로 찾으신 이미지전용 키
const MODEL_NAME = "gemini-2.0-flash";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 💡 [JSON 정밀 추출] AI의 설명 찌꺼기를 제거하고 데이터만 추출
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("유효한 JSON 구조를 찾을 수 없습니다.");
    
    let jsonStr = content.substring(startIdx, endIdx + 1);
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });
    return JSON.parse(jsonStr);
  } catch (e: any) {
    throw new Error(`데이터 파싱 실패: ${e.message}`);
  }
};

/**
 * 💡 [무한 로딩 방지] 타임아웃 기능 fetch
 */
const fetchWithTimeout = async (url: string, options: any, timeout = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e: any) {
    clearTimeout(id);
    throw e;
  }
};

/**
 * [기능 1] 이미지 배경 합성 로직 (이미지 전용 키 사용)
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
    // 💡 이미지 전용 API 키(IMAGE_API_KEY)를 사용합니다.
    const response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${IMAGE_API_KEY}` 
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [{
          "role": "user",
          "content": [
            { "type": "text", "text": `TASK: AMATEUR IPHONE SNAPSHOT INPAINTING. DNA: ${globalBackgroundDNA}. Scene: ${imgReq.nanoPrompt}` },
            { "type": "image_url", "image_url": { "url": `data:${originalImage.mimeType};base64,${originalImage.data}` } }
          ]
        }]
      })
    }, 50000);

    const result = await response.json();
    return {
      url: result.choices?.[0]?.message?.content || "",
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error) {
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 생성 로직 (텍스트 전용 키 사용)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 SEO/GEO 품질 극대화 지침
  const systemInstruction = `당신은 네이버 블로그 SEO 및 AI 검색(GEO) 최적화 마스터입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 제목 맨 처음에 배치하고 서브 키워드("${inputs.subKeywords}")를 조합하여 25자 내외 제목 작성.
    - 본문: 첫 150자 이내에 결론을 제시(Answer-First)하고, 수치 데이터는 표(Table)로 정리하세요. 별표(*) 사용 금지.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드 포함 제목",
    body: "SEO 최적화 본문",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 98, safetyIndex: 95, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 1500 },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  });

  try {
    // 💡 텍스트 전용 API 키(TEXT_API_KEY)를 사용합니다.
    const response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${TEXT_API_KEY}` 
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: 오직 JSON만. ${schemaStr}` }
        ],
        "temperature": 0.3
      })
    }, 60000);

    const responseText = await response.text();
    const rawData = extractJson(responseText);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx + 1}` };
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface", imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        // 💡 서버 부하 방지를 위해 이미지 생성 사이 5초 휴식
        if (idx < inputs.targetImageCount - 1) await sleep(5000);
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 결과` : rawData.title,
      content: isImageOnly ? "완료" : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages,
      groundingSources: [] 
    };
  } catch (e: any) {
    throw new Error(`콘텐츠 생성 실패: ${e.message}`);
  }
};
