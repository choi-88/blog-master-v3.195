import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정 (제공해주신 파이썬 샘플 규격 기반)
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 [에러 해결 마스터] 어떤 응답이 와도 JSON만 쏙 뽑아내는 정밀 추출 로직
 */
const extractJson = (content: string) => {
  try {
    // 텍스트에서 첫 번째 '{'와 마지막 '}'의 위치를 찾습니다.
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1) {
      throw new Error("AI 응답에서 유효한 JSON 데이터를 찾을 수 없습니다.");
    }

    // 해당 구간만 정확히 잘라냅니다.
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
    console.error("JSON 파싱 상세 에러. 원본 내용:", content);
    throw new Error(`데이터 해석 실패: ${e.message}`);
  }
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * [기능 1] 이미지 배경 합성 로직 (사용자 인페인팅 지시사항 100% 보존)
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
 * [기능 2] 전체 블로그 생성 로직 (SEO/GEO 최적화 및 제목 생성 대폭 강화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 최적화 및 키워드 조합 제목 지침 강화]
  const systemInstruction = `당신은 네이버 블로그 검색 상위 노출(SEO) 및 AI Overviews(GEO) 최적화 마스터입니다.
    
    [제목 생성 규칙 - 매우 중요]
    - 메인 키워드("${inputs.mainKeyword}")는 제목의 가장 앞부분에 배치하세요.
    - 서브 키워드("${inputs.subKeywords}")를 한 개 이상 조합하여 20~25자 내외의 명확한 문장형 제목을 만듭니다.
    - 짧지만 클릭을 유도하는 전문적인 제목을 작성하세요. (예: "메인키워드 서브키워드 조합 추천 후기")
    
    [본문 최적화 규칙]
    1. Answer-First: 도입부 첫 200자 이내에 검색 의도에 대한 결론을 두괄식으로 제시하세요. (GEO 노출 핵심)
    2. 구조화: ##와 ### 마크다운 헤더를 사용하여 정보를 논리적으로 나열하세요. 소제목에 [] 기호 사용 금지.
    3. 데이터: 제품 스펙 및 가격 정보는 반드시 '마크다운 표(Table)'를 사용하여 가독성을 높이세요.
    4. 금지 사항: 본문 어디에도 별표(*) 기호를 사용하지 마세요.
    5. ALT-TEXT: [이미지 설명: {description}] 태그를 원고 흐름에 맞춰 본문 중간중간에 5개 이상 배치하세요.`;

  const prompt = `제품명: ${inputs.productName} / 메인 키워드: ${inputs.mainKeyword} / 서브 키워드: ${inputs.subKeywords} / 테마: ${inputs.backgroundLocation}`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드와 서브키워드가 포함된 명확한 제목",
    body: "1500자 이상의 SEO 본문 원고",
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
          { "role": "user", "content": `${prompt}\n\n결과는 반드시 아래 JSON 구조만 출력하고 앞뒤 설명을 일절 생략하세요: ${schemaStr}` }
        ],
        "temperature": 0.3 // 일관된 JSON 구조를 위해 온도를 낮춤
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    // 💡 [해결 포인트] 어떤 군더더기 응답이 와도 JSON 알맹이만 정밀 추출
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
        if (idx < inputs.targetImageCount - 1) await sleep(3000); // 3초 휴식 유지
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 이미지 생성` : rawData.title,
      content: isImageOnly ? "이미지 전용 모드로 생성되었습니다." : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages,
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("시스템 생성 실패:", e);
    throw new Error(`콘텐츠 생성 실패: ${e.message}`);
  }
};
