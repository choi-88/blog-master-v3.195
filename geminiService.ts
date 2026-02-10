import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정 (제공해주신 py 샘플 규격)
const API_URL = "[https://openai.apikey.run/v1/chat/completions](https://openai.apikey.run/v1/chat/completions)";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 [에러 해결 마스터] 가장 강력한 JSON 정밀 추출 로직
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1) {
      throw new Error("응답 데이터에서 JSON 형식을 찾을 수 없습니다.");
    }

    let jsonStr = content.substring(startIdx, endIdx + 1);

    // [Bad control character 해결] 줄바꿈 및 제어 문자 보정
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });

    return JSON.parse(jsonStr);
  } catch (e: any) {
    console.error("JSON 파싱 실패. 원본 데이터:", content);
    throw new Error(`데이터 해석 실패: ${e.message}`);
  }
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * [기능 1] 이미지 배경 합성 로직 (사용자 인페인팅 지시사항 보존)
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
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": `TASK: AMATEUR IPHONE SNAPSHOT INPAINTING. Replace background with "${backgroundLocation}", ${backgroundDish} on "${backgroundMaterial}", "${backgroundColor}" palette. DNA: ${globalBackgroundDNA}. Scene: ${imgReq.nanoPrompt}`
              },
              {
                "type": "image_url",
                "image_url": { "url": `data:${originalImage.mimeType};base64,${originalImage.data}` }
              }
            ]
          }
        ]
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
    console.error("이미지 개별 생성 실패:", error);
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 생성 로직 (SEO/GEO 최적화 강화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 최적화 및 제목 생성 지침 강화]
  const systemInstruction = `당신은 네이버 블로그 검색 상위 노출(SEO) 및 AI Overviews(GEO) 마스터입니다.
    
    [제목 최적화 규칙]
    - 메인 키워드("${inputs.mainKeyword}")를 반드시 제목의 가장 앞부분에 배치하세요.
    - 서브 키워드("${inputs.subKeywords}")를 적절히 조합하여 20~25자 사이의 명확한 문장형 제목을 만드세요.
    
    [본문 최적화 규칙]
    1. 도입부: 첫 200자 이내에 검색 의도에 대한 명확한 결론(Answer-First)을 두괄식으로 제시하세요. (GEO 최적화 핵심)
    2. 정보 구조: ##와 ### 마크다운 헤더를 사용하여 구조화하고, 소제목에 특수문자 [] 사용을 금지합니다.
    3. 데이터 시각화: 제품 스펙, 가격 등 수치 정보는 반드시 '마크다운 표(Table)'를 사용하여 정리하세요.
    4. 금지 사항: 본문 전체에서 별표(*) 기호를 절대 사용하지 마세요.
    5. ALT-TEXT: [이미지 설명: {description}] 형태의 태그를 원고 흐름에 맞춰 자연스럽게 삽입하세요.`;

  const prompt = `제품명: ${inputs.productName} / 메인 키워드: ${inputs.mainKeyword} / 서브 키워드: ${inputs.subKeywords} / 테마: ${inputs.backgroundLocation}`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "키워드 조합형 제목",
    body: "SEO 최적화 본문",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 95, safetyIndex: 90, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 1500 },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  });

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `${prompt}\n\n결과는 반드시 아래 JSON 구조만 출력하고 앞뒤 설명을 생략하세요: ${schemaStr}` }
        ],
        "temperature": 0.3 // 데이터 구조 안정성을 위해 온도를 낮춤
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    // 💡 [해결 포인트] 어떤 군더더기 응답이 와도 JSON만 정밀 추출
    const rawData = extractJson(result.choices[0].message.content);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    // 💡 [이미지 순차 생성] 429 에러 방지를 위해 3초 간격 진행
    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx + 1}` };
        const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface";
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, currentDishStyle, imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        if (idx < inputs.targetImageCount - 1) await sleep(3000); // 3초 휴식
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 이미지` : rawData.title,
      content: isImageOnly ? "이미지 생성 완료" : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages,
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("생성 실패:", e);
    throw new Error(`콘텐츠 생성 실패: ${e.message}`);
  }
};
