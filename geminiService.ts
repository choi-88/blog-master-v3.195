import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

/**
 * 💡 [에러 해결 마스터] AI가 마크다운을 섞거나, 서버가 HTML 에러 페이지를 보내도 
 * 무조건 진짜 JSON 데이터만 찾아내는 정밀 수술 도구입니다.
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1) {
      // 💡 만약 HTML 에러 페이지(The page c...)가 오면 여기서 필터링됩니다.
      if (content.includes('<!DOCTYPE') || content.includes('<html')) {
        throw new Error("서버가 데이터 대신 에러 페이지를 보냈습니다. 잠시 후 다시 시도해주세요.");
      }
      throw new Error("응답에서 데이터 구조를 찾을 수 없습니다.");
    }

    let jsonStr = content.substring(startIdx, endIdx + 1);

    // [Bad control character 해결] 제어 문자 보정
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });

    return JSON.parse(jsonStr);
  } catch (e: any) {
    console.error("파싱 실패 원본 데이터:", content);
    throw new Error(`데이터 해석 실패: ${e.message}`);
  }
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// API 설정
const TEXT_API_URL = "[https://openai.apikey.run/v1/chat/completions](https://openai.apikey.run/v1/chat/completions)";
const TEXT_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; 
const API_SECRET = import.meta.env.VITE_OPENROUTER_API_KEY; // 시크릿 키

// 💡 이미지 키가 http로 시작하면 그 자체가 주소, 아니면 규격 주소 사용
const IMAGE_SETTING = import.meta.env.VITE_IMAGE_API_KEY || "";
const IMAGE_ENDPOINT = IMAGE_SETTING.startsWith('http') 
  ? IMAGE_SETTING 
  : "[https://openai.apikey.run/v1/images/generations](https://openai.apikey.run/v1/images/generations)";

/**
 * [기능 1] 이미지 생성 (주소형 키 & 401 에러 방어)
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
    const response = await fetch(IMAGE_ENDPOINT, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_SECRET}` 
      },
      body: JSON.stringify({
        "model": "dall-e-3",
        "prompt": `Professional product photo in "${backgroundLocation}" on "${backgroundMaterial}" with "${backgroundColor}" theme. DNA: ${globalBackgroundDNA}. Scene: ${imgReq.nanoPrompt}`,
        "n": 1,
        "size": "1024x1024"
      })
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      console.warn(`이미지 생성 서버 응답 이상: ${response.status}`, errorMsg);
      return { url: '', filename: `failed_${index}.png`, description: '서버 부하', nanoPrompt: '' };
    }
    
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
 * [기능 2] 블로그 생성 (SEO/GEO 최적화 고정)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 SEO/GEO 전략: 키워드 전진 배치 및 Answer-First
  const systemInstruction = `당신은 네이버 블로그 SEO 전문가입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 제목 가장 처음에 배치하고 서브 키워드를 조합하세요.
    - 본문: 첫 150자 이내에 핵심 결론(Answer-First)을 배치하고, 수치 데이터는 표(Table)를 필수 사용하세요.`;

  try {
    const response = await fetch(TEXT_API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_SECRET}`
      },
      body: JSON.stringify({
        "model": "gemini-2.0-flash",
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: 오직 JSON만.` }
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
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Natural", description: `설명 ${idx + 1}` };
        
        const imgRes = await generateInpaintedImage(
          inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, 
          inputs.backgroundMaterial, (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface", 
          imgReq, idx, inputs.mainKeyword || inputs.productName, dna
        );
        
        if (imgRes.url) finalImages.push(imgRes);
        // 💡 429 부하 방지를 위해 이미지 생성 사이 5초 휴식
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
