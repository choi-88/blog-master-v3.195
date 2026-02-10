import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 환경 변수 가져오기
const TEXT_SETTING = import.meta.env.VITE_OPENROUTER_API_KEY; // 텍스트용 (주소 혹은 sk-키)
const IMAGE_SETTING = import.meta.env.VITE_IMAGE_API_KEY;    // 이미지용 (주소 혹은 sk-키)
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 [핵심 로직] 키가 주소 형식이면 주소로, 문자열이면 키로 분리해주는 함수입니다.
 */
const getRequestConfig = (setting: string, defaultUrl: string) => {
  if (!setting) return { url: defaultUrl, key: "" };
  // http로 시작하면 그 자체가 주소(Endpoint)입니다.
  if (setting.trim().startsWith('http')) {
    return { url: setting.trim(), key: setting.trim() };
  }
  // 일반 sk- 등의 키라면 기본 주소를 사용합니다.
  return { url: defaultUrl, key: setting.trim() };
};

const TEXT_CONFIG = getRequestConfig(TEXT_SETTING, "https://openai.apikey.run/v1/chat/completions");
const IMAGE_CONFIG = getRequestConfig(IMAGE_SETTING, TEXT_CONFIG.url);

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 💡 [JSON 정밀 추출] AI의 설명 찌꺼기를 제거하고 데이터만 추출합니다.
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
    throw new Error(`데이터 파싱 실패: ${e.message}`);
  }
};

/**
 * [기능 1] 이미지 생성 (주소형 키 대응)
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
    const response = await fetch(IMAGE_CONFIG.url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${IMAGE_CONFIG.key}` 
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [{
          "role": "user",
          "content": [
            { "type": "text", "text": `TASK: INPAINTING. Place in "${backgroundLocation}" on "${backgroundMaterial}". Palette: "${backgroundColor}". DNA: ${globalBackgroundDNA}. Detail: ${imgReq.nanoPrompt}` },
            { "type": "image_url", "image_url": { "url": `data:${originalImage.mimeType};base64,${originalImage.data}` } }
          ]
        }]
      })
    });

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
 * [기능 2] 블로그 생성 (SEO/GEO 최적화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  const systemInstruction = `당신은 네이버 블로그 SEO 전문가입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 제목 가장 처음에 배치.
    - 본문: 첫 150자 이내에 결론(Answer-First) 배치. 표(Table) 필수 사용. 별표(*) 금지.`;

  try {
    const response = await fetch(TEXT_CONFIG.url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${TEXT_CONFIG.key}` 
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답: JSON.` }
        ],
        "temperature": 0.3
      })
    });

    const result = await response.json();
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
    throw new Error(`생성 실패: ${e.message}`);
  }
};
