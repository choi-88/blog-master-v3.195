import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 [에러 해결 마스터] 가장 강력한 JSON 추출 로직
 */
const extractJson = (content: string) => {
  try {
    // 1. 텍스트에서 첫 번째 '{'와 마지막 '}'의 위치를 찾습니다.
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1) {
      throw new Error("응답 데이터에서 JSON 형식을 찾을 수 없습니다.");
    }

    // 2. 해당 구간만 잘라냅니다.
    let jsonStr = content.substring(startIdx, endIdx + 1);

    // 3. [Bad control character 해결] 제어 문자 및 줄바꿈 보정
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return '';
    });

    return JSON.parse(jsonStr);
  } catch (e: any) {
    console.error("JSON 파싱 실패. 원본:", content);
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
    const output = result.choices?.[0]?.message?.content || "";

    return {
      url: output,
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };
  } catch (error: any) {
    console.error("이미지 개별 생성 실패:", error);
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 생성 (SEO/GEO 최적화 대폭 강화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 지시사항 대폭 강화]
  const systemInstruction = `당신은 네이버 블로그 검색 엔진 최적화(SEO) 및 AI 검색(GEO) 마스터입니다.
    
    [제목 최적화 지침]
    - 메인 키워드("${inputs.mainKeyword}")를 반드시 제목의 가장 앞부분에 배치하세요.
    - 서브 키워드("${inputs.subKeywords}")를 한 개 이상 조합하여 20~25자 이내의 명확한 제목을 만드세요.
    - 호기심을 유발하는 문구보다 '검색어'에 충실한 제목을 작성하세요.
    
    [콘텐츠 최적화 지침]
    1. 도입부(첫 200자): 검색 의도에 대한 명확한 결론(Answer-First)을 두괄식으로 제시하세요.
    2. 정보 구조: ## 중제목과 ### 소제목을 사용해 가독성을 높이세요.
    3. 스펙 요약: 제품 정보와 가격은 반드시 '마크다운 표(Table)'로 정리해 본문 중간에 배치하세요.
    4. 기호 제한: 별표(*) 및 소제목의 [] 기호 사용을 절대 금지합니다.
    5. EEAT: 실제 사용자의 생생한 목소리로 신뢰감 있는 리뷰를 작성하세요.`;

  const prompt = `제품명: ${inputs.productName} / 메인키워드: ${inputs.mainKeyword} / 서브키워드: ${inputs.subKeywords} / 테마: ${inputs.backgroundLocation}`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "메인키워드+서브키워드 조합형 제목",
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
          { "role": "user", "content": `${prompt}\n\n결과는 반드시 아래 JSON 구조만 출력하세요. 앞뒤 설명은 금지합니다: ${schemaStr}` }
        ],
        "temperature": 0.4 // 데이터 안정성을 위해 낮춤
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    // 💡 [해결 포인트] 어떤 응답이 와도 JSON만 정밀 추출
    const rawData = extractJson(result.choices[0].message.content);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx+1}` };
        const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface";
        
        const imgRes = await generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, currentDishStyle, imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
        
        if (imgRes.url) finalImages.push(imgRes);
        
        // 429 에러 방지를 위한 3초 대기
        if (idx < inputs.targetImageCount - 1) await sleep(3000);
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
