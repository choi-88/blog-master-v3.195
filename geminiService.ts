import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정 (제공해주신 파이썬 샘플 기반)
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 [에러 해결 마스터] AI가 앞뒤에 어떤 설명을 붙여도 JSON만 정확히 타격합니다.
 */
const extractJson = (content: string) => {
  try {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1) {
      throw new Error("응답에서 JSON 구조를 찾을 수 없습니다.");
    }

    let jsonStr = content.substring(startIdx, endIdx + 1);

    // [Bad control character & Newline 해결]
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });

    return JSON.parse(jsonStr);
  } catch (e: any) {
    console.error("JSON 파싱 에러. 원본:", content);
    throw new Error(`데이터 해석 실패: ${e.message}`);
  }
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

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
    console.error(`이미지 ${index+1} 생성 실패:`, error);
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 생성 로직 (SEO/GEO 최적화 강화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 및 제목 생성 지침 극대화]
  const systemInstruction = `당신은 네이버 블로그 검색 상위 노출(SEO) 및 AI 검색(GEO) 최적화의 대가입니다.
    
    [제목 생성 핵심]
    - 반드시 메인 키워드("${inputs.mainKeyword}")를 제목의 가장 처음에 배치하세요.
    - 서브 키워드("${inputs.subKeywords}")를 조합하여 20~25자 사이의 '정보성+리뷰형' 제목을 작성하세요.
    - 예: ${inputs.mainKeyword} ${inputs.subKeywords} 사용 후기 및 장단점 정리
    
    [콘텐츠 최적화 핵심]
    1. GEO Answer-First: 도입부 첫 150자 이내에 제품의 핵심 결론을 두괄식으로 명확히 제시하세요.
    2. 구조화: ## 중제목과 ### 소제목을 사용하고, 특수문자 [] 사용은 절대 금지합니다.
    3. 데이터: 제품 스펙 및 가격은 반드시 '마크다운 표(Table)'로 작성하세요.
    4. 기호 금지: 본문 어디에도 별표(*) 기호를 사용하지 마세요.
    5. ALT-TEXT: [이미지 설명: {description}] 형태의 태그를 원고 문맥에 맞춰 5개 이상 배치하세요.
    6. EEAT: 인공지능이 쓴 것 같지 않은, 실제 사용자의 생생한 목소리를 담으세요.`;

  const prompt = `제품명: ${inputs.productName} / 메인키워드: ${inputs.mainKeyword} / 서브키워드: ${inputs.subKeywords} / 테마: ${inputs.backgroundLocation}`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드가 전진 배치된 제목",
    body: "SEO 최적화 본문 원고",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 98, safetyIndex: 95, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 1500 },
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
          { "role": "user", "content": `${prompt}\n\n결과는 반드시 아래 JSON 구조만 출력하세요. 앞뒤에 인삿말이나 설명을 절대 붙이지 마세요: ${schemaStr}` }
        ],
        "temperature": 0.4
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    // 💡 [해결 포인트] 어떤 군더더기 응답이 와도 JSON만 추출
    const rawData = extractJson(result.choices[0].message.content);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    // 💡 [이미지 순차 생성] 429 에러 방지를 위해 4초 간격 진행
    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx + 1}` };
        const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface";
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, currentDishStyle, imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        if (idx < inputs.targetImageCount - 1) await sleep(4000); // 4초로 지연 시간 확대
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 이미지 결과` : rawData.title,
      content: isImageOnly ? "이미지 생성 완료" : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages,
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("최종 생성 실패:", e);
    throw new Error(`콘텐츠 생성 실패: ${e.message}`);
  }
};
