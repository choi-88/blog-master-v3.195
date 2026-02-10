import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 💡 사용자님이 최종 확인해주신 절대 주소 (오타 방지를 위해 문자열 그대로 사용)
const TEXT_URL = "https://openai.apikey.run/v1/chat/completions";
const IMAGE_URL = "https://openai.apikey.run/v1/images/generations";

// 환경 변수에서 시크릿 키 하나로 통합 (사용자님 확인 사항 반영)
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; 
const MODEL_NAME = "gemini-2.0-flash";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 💡 [에러 해결 마스터] 어떤 군더더기가 붙어와도 JSON 알맹이만 정밀 추출합니다.
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("JSON 구조를 찾을 수 없습니다.");
    
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
 * [기능 1] 이미지 생성 (이미지 전용 주소 사용)
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
    const response = await fetch(IMAGE_URL, { // 💡 슬래시 없는 절대 경로 사용
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        "model": "dall-e-3",
        "prompt": `Product in "${backgroundLocation}" on "${backgroundMaterial}" with "${backgroundColor}" palette. DNA: ${globalBackgroundDNA}. Scene: ${imgReq.nanoPrompt}`,
        "n": 1, "size": "1024x1024"
      })
    });

    if (!response.ok) return { url: '', filename: 'error.png', description: '부하', nanoPrompt: '' };
    const result = await response.json();
    return {
      url: result.data?.[0]?.url || "",
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error) {
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 블로그 생성 (SEO/GEO 최적화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  const systemInstruction = `당신은 네이버 블로그 SEO 전문가입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 제목 맨 처음에 배치.
    - 본문: 도입부 150자 이내 결론(Answer-First). 표(Table) 필수. 별표(*) 금지.`;

  try {
    const response = await fetch(TEXT_URL, { // 💡 슬래시 없는 절대 경로 사용
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: JSON.` }
        ],
        "temperature": 0.3
      })
    });

    const responseText = await response.text();
    if (!response.ok) throw new Error(`서버 에러 (${response.status})`);

    const rawData = extractJson(responseText);
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
