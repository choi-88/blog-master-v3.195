import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. API 설정
// 💡 만약 이미지 키 자체가 주소라면, IMAGE_API_URL 자리에 그 키를 통째로 넣으세요.
const TEXT_API_URL = "https://openai.apikey.run/v1/chat/completions";
const IMAGE_API_KEY_OR_URL = import.meta.env.VITE_IMAGE_API_KEY; // 주소 형태의 키
const TEXT_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; 
const MODEL_NAME = "gemini-2.0-flash";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * 💡 [에러 해결] JSON 정밀 추출기
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
    // 💡 키가 주소 형태라면, fetch의 첫 번째 인자로 그 주소를 사용합니다.
    // 만약 "주소+키" 결합형이라면 아래 URL 자리에 IMAGE_API_KEY_OR_URL을 넣으세요.
    const response = await fetch(IMAGE_API_KEY_OR_URL.includes('http') ? IMAGE_API_KEY_OR_URL : TEXT_API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${IMAGE_API_KEY_OR_URL}` // 헤더에도 일단 넣어줍니다.
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [{
          "role": "user",
          "content": [
            { "type": "text", "text": `TASK: PRODUCT INPAINTING. Place in "${backgroundLocation}" on "${backgroundMaterial}". Palette: "${backgroundColor}". DNA: ${globalBackgroundDNA}. Detail: ${imgReq.nanoPrompt}` },
            { "type": "image_url", "image_url": { "url": `data:${originalImage.mimeType};base64,${originalImage.data}` } }
          ]
        }]
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    return {
      url: result.choices?.[0]?.message?.content || "",
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error) {
    console.error("Image Error:", error);
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 블로그 생성 (SEO/GEO 최적화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // SEO/GEO 지침 강화
  const systemInstruction = `당신은 네이버 블로그 SEO 전문가입니다.
    - 제목: 메인 키워드("${inputs.mainKeyword}")를 제목 가장 처음에 배치하고 서브 키워드를 조합하세요.
    - 본문: 첫 150자 이내에 결론(Answer-First)을 배치하세요. 표(Table)를 적극 활용하고 별표(*) 사용은 금지합니다.`;

  try {
    const response = await fetch(TEXT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TEXT_API_KEY}` },
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
        if (idx < inputs.targetImageCount - 1) await sleep(5000); // 💡 이미지 생성 사이 5초 휴식
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
