import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정 (제공해주신 파이썬 샘플 기반)
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 [에러 해결 핵심] 제어 문자 제거 및 JSON 파싱 함수
 */
const extractJson = (content: string) => {
  try {
    // 마크다운 코드 블록 제거
    let cleaned = content.replace(/```json?\n?/, "").replace(/\n?```/, "").trim();
    
    // [이미지 0ff97f.png 에러 해결] 
    // 문자열 내부의 실제 줄바꿈, 탭 등 제어 문자를 제거하거나 이스케이프 처리
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });

    return JSON.parse(cleaned);
  } catch (e: any) {
    console.error("JSON 파싱 상세 에러:", e);
    throw new Error(`데이터 해석 실패: ${e.message}`);
  }
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * [기능 1] 이미지 배경 합성 로직 (사용자 지시사항 보존)
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
                "image_url": {
                  "url": `data:${originalImage.mimeType};base64,${originalImage.data}`
                }
              }
            ]
          }
        ]
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    return {
      url: result.choices?.[0]?.message?.content || "",
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error: any) {
    console.error("이미지 생성 개별 실패:", error);
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 시스템 생성 로직 (SEO/GEO 대폭 강화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 및 제목 생성 로직 대폭 강화]
  const systemInstruction = `당신은 네이버 블로그 '상위 1%' 노출 전문가이자 GEO(AI 검색) 최적화 마스터입니다.
    
    [제목 생성 규칙]
    - 메인 키워드("${inputs.mainKeyword}")는 반드시 제목 맨 앞에 배치합니다.
    - 서브 키워드("${inputs.subKeywords}")를 조합하여 20~25자 사이의 명확한 문장형 제목을 만듭니다.
    - 호기심을 유발하되 정보성이 뚜렷해야 합니다.
    
    [본문 작성 규칙 - SEO/GEO 최적화]
    1. Answer-First: 도입부 첫 3문장 이내에 제품의 핵심 장점과 결론을 요약하여 배치하세요.
    2. Logical Structure: ##(중제목), ###(소제목)을 사용하여 정보를 구조화하세요. (특수문자 [] 사용 금지)
    3. Factual Table: 제품 정보(가격, 스펙 등)는 반드시 마크다운 표(Table)로 요약하여 본문 중간에 배치하세요.
    4. Realistic EEAT: 실제 사용자가 내돈내산으로 리뷰하는 듯한 자연스러운 구어체를 사용하세요. (~해요, ~네요 등)
    5. Forbidden: 본문 전체에서 별표(*) 기호를 절대 사용하지 마세요.
    6. Alt-Text: [이미지 설명: {description}] 형태의 태그를 원고 흐름에 맞춰 5개 이상 적절히 배치하세요.`;

  const prompt = `제품명: ${inputs.productName} / 메인 키워드: ${inputs.mainKeyword} / 서브 키워드: ${inputs.subKeywords} / 테마: ${inputs.backgroundLocation} / 페르소나 톤앤매너: ${inputs.persona.writingTone}.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "키워드가 포함된 매력적인 제목",
    body: "1500자 이상의 SEO 본문",
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
          { "role": "user", "content": `${prompt}\n\n결과는 반드시 다음 JSON 구조를 따르며, 문자열 내부에 실제 줄바꿈 대신 \\n을 사용하세요: ${schemaStr}` }
        ],
        "temperature": 0.5 // JSON 구조 안정성을 위해 온도를 낮춤
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    const rawData = extractJson(result.choices[0].message.content);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    // 💡 [이미지 429 에러 해결] 순차적 이미지 생성 로직
    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx+1}` };
        const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface";
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, currentDishStyle, imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        
        // 429 에러 방지를 위한 2초 지연 (상당히 중요)
        if (idx < inputs.targetImageCount - 1) await sleep(2000);
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 이미지` : rawData.title,
      content: isImageOnly ? "이미지 전용 모드" : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages,
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("블로그 시스템 생성 실패:", e);
    throw new Error(`콘텐츠 생성 실패: ${e.message}`);
  }
};
