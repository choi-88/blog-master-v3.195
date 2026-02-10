import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 [에러 해결 마스터] HTML 에러 페이지나 텍스트 찌꺼기를 완벽 필터링합니다.
 */
const extractJson = (content: string) => {
  try {
    // 텍스트에서 첫 번째 '{'와 마지막 '}' 사이만 추출 (HTML 페이지 등이 섞여도 무시)
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1) {
      console.error("받은 원본 데이터:", content);
      throw new Error("서버 응답이 올바른 데이터 형식이 아닙니다. (API 서버 점검 필요)");
    }

    let jsonStr = content.substring(startIdx, endIdx + 1);

    // JSON 내부의 제어 문자 및 줄바꿈 보정
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

    if (!response.ok) return { url: '', filename: 'error.png', description: '서버 부하', nanoPrompt: '' };
    
    const result = await response.json();
    const output = result.choices?.[0]?.message?.content || "";

    return {
      url: output,
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error) {
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 생성 로직 (SEO/GEO 최적화 극대화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 지침 강화] 메인 키워드를 제목 전면에 배치하도록 강제
  const systemInstruction = `당신은 네이버 블로그 SEO 및 GEO 최적화 마스터입니다.
    
    [제목 생성 핵심]
    - 메인 키워드("${inputs.mainKeyword}")를 반드시 제목의 맨 처음에 배치하세요.
    - 서브 키워드("${inputs.subKeywords}")를 조합하여 20~25자 사이의 명확한 제목을 만드세요.
    
    [본문 최적화 핵심]
    1. 도입부: 첫 150자 이내에 결론(Answer-First)을 명확히 제시하세요.
    2. 표(Table): 제품 정보와 수치는 반드시 마크다운 표로 정리하세요.
    3. 금지: 별표(*) 및 소제목 [] 기호 사용 절대 금지.
    4. ALT-TEXT: [이미지 설명: {description}] 형태를 본문 흐름에 맞춰 5개 이상 배치하세요.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드 전진 배치형 제목",
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
          { "role": "user", "content": `제품: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 응답은 오직 순수 JSON만 출력하세요: ${schemaStr}` }
        ],
        "temperature": 0.3
      })
    });

    // 💡 [해결 포인트] 서버가 404나 500 HTML을 보내는지 먼저 확인
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`API 서버 응답 에러 (${response.status}). 잠시 후 다시 시도해주세요.`);
    }

    const rawData = extractJson(responseText);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    // 💡 [이미지 순차 생성] 5초 간격으로 서버 부하 방지
    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx + 1}` };
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface", imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        if (idx < inputs.targetImageCount - 1) await sleep(5000); // 5초 대기
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
    throw new Error(`콘텐츠 생성 실패: ${e.message}`);
  }
};
