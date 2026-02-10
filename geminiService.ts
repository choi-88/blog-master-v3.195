import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 안전 장치: JSON 파싱 및 지연 함수
 */
const extractJson = (content: string) => {
  const jsonMatch = content.match(/```json?\n?([\s\S]*?)\n?```/);
  const rawJson = jsonMatch ? jsonMatch[1] : content;
  return JSON.parse(rawJson.trim());
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
    console.error("Image generation failed:", error);
    return { url: '', filename: `failed_${index}.png`, description: '실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 전체 블로그 시스템 생성 로직 (SEO/GEO 최적화 + 순차 이미지 생성)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [SEO/GEO 최적화 지시사항 강화]
  const systemInstruction = `[Role: Naver Blog SEO & GEO Content Master]
    당신은 네이버 블로그 검색 상위 노출과 AI Overviews(GEO)에 최적화된 콘텐츠를 작성하는 전문가입니다.
    
    STRICT CONTENT RULES:
    1. TITLE: 메인 키워드("${inputs.mainKeyword}")와 서브 키워드("${inputs.subKeywords}")를 자연스럽게 조합하여 25자 내외의 명확하고 매력적인 제목을 작성하세요.
    2. LOGICAL HIERARCHY: ##와 ### 마크다운 헤더를 사용하여 가독성 높은 구조를 만드세요. 소제목에 [], () 등 특수문자 사용 금지.
    3. ANSWER-FIRST: 서론의 첫 200자 이내에 사용자의 검색 의도에 대한 명확한 결론(정답)을 제시하세요. (GEO 최적화 핵심)
    4. FACTUAL DATA: 제품의 스펙, 가격 등 수치 데이터는 반드시 마크다운 표(Table) 형식을 사용하여 정리하세요.
    5. E-E-A-T: 실제 사용자가 작성한 것처럼 개인적인 경험과 통찰이 담긴 톤을 유지하세요. 'AI가 쓴 것 같은' 전형적인 말투를 피하세요.
    6. FORBIDDEN: 별표(*) 기호를 절대 사용하지 마세요. 강조는 문맥이나 헤더로 처리하세요.
    7. ALT-TEXT: 본문 적재적소에 [이미지 설명: {description}] 형태의 플레이스홀더를 삽입하세요.`;

  const prompt = `
    [제품 정보]
    제품명: ${inputs.productName}
    메인 키워드: ${inputs.mainKeyword}
    서브 키워드: ${inputs.subKeywords}
    참고 링크: ${inputs.referenceLink || '없음'}
    
    [페르소나 설정]
    타겟 독자: ${inputs.persona.targetAudience}
    페인 포인트: ${inputs.persona.painPoint}
    글의 톤: ${inputs.persona.writingTone}
    진행 방향: ${inputs.persona.contentFlow || 'AI 추천 최적 흐름'}
    
    작업 지시:
    상기 정보를 바탕으로 SEO 규칙을 준수하여 1,500자 이상의 고품질 원고를 작성하고, 아래 JSON 구조에 맞춰 응답하세요.`;

  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "짧고 명확한 키워드 조합형 제목",
    body: "SEO 최적화된 본문 내용",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 0, safetyIndex: 0, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 0 },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  });

  try {
    // 텍스트 생성 요청
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
          { "role": "user", "content": `${prompt}\n\n응답 형식(JSON): ${schemaStr}` }
        ],
        "temperature": 0.8 // 창의적인 제목과 문장 생성을 위해 약간 높임
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    const content = result.choices[0].message.content;
    const rawData = extractJson(content);
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    // 💡 [이미지 순차 생성 로직] - 429 에러 방지
    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      console.log("이미지 순차 생성 시작...");
      for (let idx = 0; idx < inputs.targetImageCount; idx++) {
        try {
          const imgIdx = idx % inputs.productImages.length;
          const originalImage = inputs.productImages[imgIdx];
          const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `이미지 설명 ${idx+1}` };
          const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface";
          
          const imgResult = await generateInpaintedImage(
            originalImage, 
            inputs.backgroundLocation, 
            inputs.backgroundColor, 
            inputs.backgroundMaterial, 
            currentDishStyle, 
            imgReq, 
            idx, 
            inputs.mainKeyword || inputs.productName, 
            dna
          );
          
          if (imgResult.url) {
            finalImages.push(imgResult);
          }
          
          // 각 이미지 생성 사이에 1.5초 휴식 (서버 부하 조절)
          if (idx < inputs.targetImageCount - 1) {
            await sleep(1500);
          }
        } catch (imgError) {
          console.error(`${idx + 1}번째 이미지 생성 실패:`, imgError);
        }
      }
    }

    return {
      title: isImageOnly ? `${inputs.productName} 이미지 생성` : rawData.title,
      content: isImageOnly ? "이미지 전용 모드" : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages,
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("System generation error:", e);
    throw new Error(`콘텐츠 생성 오류: ${e.message}`);
  }
};
