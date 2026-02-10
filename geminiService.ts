import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. API 설정
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 💡 [에러 해결 마스터] 지저분한 응답에서도 JSON만 정밀 추출
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("유효한 데이터 구조를 찾을 수 없습니다.");
    
    let jsonStr = content.substring(startIdx, endIdx + 1);
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });
    return JSON.parse(jsonStr);
  } catch (e: any) {
    throw new Error(`데이터 해석 실패: ${e.message}`);
  }
};

/**
 * 💡 [핵심] 타임아웃 기능이 포함된 fetch 함수 (무한 로딩 방지)
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
    if (e.name === 'AbortError') throw new Error("서버 응답 시간이 초과되었습니다. 다시 시도해주세요.");
    throw e;
  }
};

/**
 * [기능 1] 이미지 배경 합성 로직
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
    const response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
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
    }, 40000); // 이미지당 40초 타임아웃

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
 * [기능 2] 전체 블로그 생성 로직 (SEO/GEO 최적화 강화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 지침] 메인 키워드 전진 배치 및 두괄식 구성
  const systemInstruction = `당신은 네이버 블로그 SEO 및 AI 검색(GEO) 최적화 마스터입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 반드시 제목 맨 처음에 배치하고 서브 키워드("${inputs.subKeywords}")를 조합하세요.
    - 본문: 첫 150자 이내에 결론을 제시(Answer-First)하고, 수치 데이터는 표(Table)로 정리하세요. 별표(*) 사용 금지.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드 포함 제목",
    body: "SEO 최적화 원고",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 95, safetyIndex: 90, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 1500 },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  });

  try {
    const response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: 오직 JSON만. ${schemaStr}` }
        ],
        "temperature": 0.3
      })
    }, 60000); // 텍스트 생성 60초 타임아웃

    if (response.status === 429) throw new Error("현재 서버 부하가 높습니다. 1분 후 다시 시도해주세요.");

    const result = await response.json();
    const rawData = extractJson(result.choices[0].message.content);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx + 1}` };
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface", imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        if (idx < inputs.targetImageCount - 1) await sleep(5000); // 5초 지연
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
