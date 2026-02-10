import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 및 재시도 설정
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";
const MAX_RETRIES = 3; // 429 에러 발생 시 최대 재시도 횟수

/**
 * 💡 [에러 해결 마스터] 지연 함수 및 JSON 정밀 추출
 */
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("JSON 구조 없음");
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
 * 💡 [핵심 추가] 429 에러 대응 자동 재시도 함수
 */
const fetchWithRetry = async (url: string, options: any, retries = MAX_RETRIES): Promise<any> => {
  const response = await fetch(url, options);
  
  if (response.status === 429 && retries > 0) {
    console.warn(`서버 부하(429) 감지. ${4 - retries}회차 재시도 중...`);
    await sleep(4000); // 4초 대기 후 재시도
    return fetchWithRetry(url, options, retries - 1);
  }
  
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`서버 응답 에러 (${response.status}): ${errorBody}`);
  }
  
  return response.json();
};

/**
 * [기능 1] 이미지 배경 합성 로직 (순차 생성 및 재시도 적용)
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
    const result = await fetchWithRetry(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [{
          "role": "user",
          "content": [
            { "type": "text", "text": `TASK: AMATEUR IPHONE SNAPSHOT INPAINTING. Background: "${backgroundLocation}", Style: ${backgroundDish}, Material: "${backgroundMaterial}", Theme: "${backgroundColor}", DNA: ${globalBackgroundDNA}. Scene: ${imgReq.nanoPrompt}` },
            { "type": "image_url", "image_url": { "url": `data:${originalImage.mimeType};base64,${originalImage.data}` } }
          ]
        }]
      })
    });

    return {
      url: result.choices?.[0]?.message?.content || "",
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error) {
    console.error(`이미지 ${index + 1} 생성 실패:`, error);
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 생성 로직 (SEO/GEO 최적화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  const systemInstruction = `당신은 네이버 블로그 SEO 및 GEO 최적화 마스터입니다.
    [제목 핵심] 메인 키워드("${inputs.mainKeyword}")를 맨 앞에 배치하고 서브 키워드를 조합하여 25자 내외 제목 작성.
    [본문 핵심] 도입부 150자 이내 결론 제시(Answer-First), 표(Table) 활용, 별표(*) 및 [] 기호 절대 금지.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "키워드 조합형 제목",
    body: "SEO 최적화 본문 원고",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 98, safetyIndex: 95, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 1500 },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  });

  try {
    const result = await fetchWithRetry(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 지시: 순수 JSON만 출력. ${schemaStr}` }
        ],
        "temperature": 0.3
      })
    });

    const rawData = extractJson(result.choices[0].message.content);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx + 1}` };
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface", imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        if (idx < inputs.targetImageCount - 1) await sleep(5000); // 이미지 간 5초 휴식
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 이미지` : rawData.title,
      content: isImageOnly ? "이미지 모드 완료" : rawData.body,
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
