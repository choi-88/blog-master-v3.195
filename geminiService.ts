import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 사용자님이 알려주신 정확한 호출 주소 설정
const TEXT_API_URL = "https://openai.apikey.run/v1/chat/completions";
const IMAGE_API_URL = "https://openai.apikey.run/v1/images/generations";

// 2. 환경 변수에서 시크릿 키 가져오기
const API_SECRET_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; 
const MODEL_NAME = "gemini-2.0-flash";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 💡 [에러 해결 마스터] AI가 답변 앞뒤에 붙이는 마크다운이나 설명을 제거하고 JSON만 추출합니다.
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("JSON 구조를 찾을 수 없습니다.");
    
    let jsonStr = content.substring(startIdx, endIdx + 1);
    // [Bad control character 해결] 제어 문자 및 실제 줄바꿈 보정
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
 * [기능 1] 이미지 생성 (전용 이미지 생성 주소 사용)
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
    // 💡 이미지 전용 엔드포인트(IMAGE_API_URL)를 호출합니다.
    const response = await fetch(IMAGE_API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${API_SECRET_KEY}` 
      },
      body: JSON.stringify({
        "model": "dall-e-3", // 이미지 생성 모델 (통합 서버 규격에 따름)
        "prompt": `Product in "${backgroundLocation}" on "${backgroundMaterial}" with "${backgroundColor}" palette. DNA: ${globalBackgroundDNA}. Detail: ${imgReq.nanoPrompt}`,
        "n": 1,
        "size": "1024x1024"
      })
    });

    if (!response.ok) return { url: '', filename: 'error.png', description: '서버 부하', nanoPrompt: '' };
    
    const result = await response.json();
    // OpenAI 규격 응답 처리 (data[0].url)
    const imageUrl = result.data?.[0]?.url || "";

    return {
      url: imageUrl,
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error) {
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 블로그 생성 (전용 텍스트 생성 주소 사용 + SEO/GEO 최적화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 최적화 지침] 메인 키워드 전진 배치 및 두괄식 구성
  const systemInstruction = `당신은 네이버 블로그 SEO 전문가입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 반드시 제목 맨 처음에 배치하세요.
    - 본문: 첫 150자 이내에 핵심 결론(Answer-First)을 제시하고, 수치는 표(Table)로 정리하세요. 별표(*) 및 [] 금지.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드 포함 제목",
    body: "SEO 최적화 본문",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 98, safetyIndex: 95, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 1500 },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  });

  try {
    // 💡 텍스트 전용 엔드포인트(TEXT_API_URL)를 호출합니다.
    const response = await fetch(TEXT_API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${API_SECRET_KEY}` 
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: JSON 전용. ${schemaStr}` }
        ],
        "temperature": 0.3
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(`서버 에러 (${response.status})`);

    const rawData = extractJson(result.choices[0].message.content);
    const dna = rawData.globalBackgroundDNA || "Realistic snapshot";

    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Natural", description: `설명 ${idx + 1}` };
        
        const imgRes = await generateInpaintedImage(
          inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, 
          inputs.backgroundMaterial, (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface", 
          imgReq, idx, inputs.mainKeyword || inputs.productName, dna
        );
        
        if (imgRes.url) finalImages.push(imgRes);
        // 💡 429 에러 방지를 위해 이미지 생성 사이 5초 휴식
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
