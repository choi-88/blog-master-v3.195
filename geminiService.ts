import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. API 설정 (사용자님의 파이썬 샘플 주소 고정)
const TEXT_API_URL = "https://openai.apikey.run/v1/chat/completions";
const TEXT_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; 
// 💡 이미지 키가 주소 형태라면 아래 변수에 그 주소를 통째로 넣으세요.
const IMAGE_API_KEY_OR_URL = import.meta.env.VITE_IMAGE_API_KEY || TEXT_API_KEY; 
const MODEL_NAME = "gemini-2.0-flash";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 💡 [에러 해결 마스터] 어떤 지저분한 응답이나 HTML 페이지가 섞여와도 JSON만 쏙 뽑아냅니다.
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("유효한 데이터 구조를 찾을 수 없습니다.");
    
    let jsonStr = content.substring(startIdx, endIdx + 1);
    // JSON 내부의 제어 문자 및 실제 줄바꿈 보정
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
 * [기능 1] 이미지 배경 합성 (사용자 선택 배경 반영 강화)
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
    const isUrlKey = IMAGE_API_KEY_OR_URL.includes('http');
    const response = await fetch(isUrlKey ? IMAGE_API_KEY_OR_URL : TEXT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${IMAGE_API_KEY_OR_URL}` },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [{
          "role": "user",
          "content": [
            { "type": "text", "text": `TASK: INPAINTING. Place in "${backgroundLocation}" on "${backgroundMaterial}" with "${backgroundColor}" palette. DNA: ${globalBackgroundDNA}. Scene: ${imgReq.nanoPrompt}` },
            { "type": "image_url", "image_url": { "url": `data:${originalImage.mimeType};base64,${originalImage.data}` } }
          ]
        }]
      })
    });

    if (!response.ok) return { url: '', filename: 'error.png', description: '서버 부하', nanoPrompt: '' };
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
 * [기능 2] 전체 블로그 생성 (SEO/GEO 최적화 적용)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 SEO/GEO 지침: 메인 키워드 전진 배치 및 두괄식 구성
  const systemInstruction = `당신은 네이버 블로그 SEO 및 AI 검색(GEO) 전문가입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 반드시 제목 맨 처음에 배치하세요.
    - 본문: 첫 150자 이내에 핵심 결론(Answer-First)을 제시하세요. 표(Table) 필수 사용. 별표(*) 및 [] 기호 금지.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드 전진형 제목",
    body: "SEO 최적화 원고",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 98, safetyIndex: 95, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 1500 },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  });

  try {
    const response = await fetch(TEXT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TEXT_API_KEY}` },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: 오직 JSON만. ${schemaStr}` }
        ],
        "temperature": 0.3
      })
    });

    const responseText = await response.text();
    if (!response.ok) throw new Error(`서버 응답 에러 (${response.status})`);

    const rawData = extractJson(responseText);
    const dna = rawData.globalBackgroundDNA || "Realistic snapshot";

    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx + 1}` };
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface", imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        if (idx < inputs.targetImageCount - 1) await sleep(5000); // 💡 이미지당 5초 대기
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
