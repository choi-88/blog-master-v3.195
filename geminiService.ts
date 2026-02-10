import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정 (보내주신 py 소스 기반)
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; // Vercel에 등록된 sk- 키
const MODEL_NAME = "gemini-2.0-flash"; // 파이썬 소스에 명시된 제미나이 모델명

/**
 * [기능 1] 이미지 배경 합성 로직 (사용자님 인페인팅 지시사항 100% 유지)
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
                "text": `TASK: AMATEUR IPHONE SNAPSHOT INPAINTING.
                STRICT RULES:
                1. PRODUCT PRESERVATION: NEVER change the product's shape, design, logo, texture, or geometry.
                2. BACKGROUND REPLACEMENT: Replace with "${backgroundLocation}".
                3. SURFACE & STYLING: ${backgroundDish} on "${backgroundMaterial}" texture.
                4. COLOR THEME: "${backgroundColor}" palette.
                5. AESTHETIC STYLE: ${globalBackgroundDNA}. (iPhone 13 Pro look).
                6. PHOTO QUALITY: Natural shadows, realistic mobile lens.
                
                SCENE DETAIL & CAMERA PERSPECTIVE: ${imgReq.nanoPrompt}`
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
    if (result.error) throw new Error(result.error.message || "이미지 생성 실패");

    // 통합 API 규격에 맞게 choices에서 응답 추출
    const output = result.choices?.[0]?.message?.content || "";

    return {
      url: output,
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
 * [기능 2] 전체 블로그 생성 로직 (SEO/GEO 최적화 지시사항 보존)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [사용자님 SEO/GEO 원본 로직 100% 유지]
  const systemInstruction = isImageOnly 
  ? `[Role: Professional Product Photographer & Prompt Engineer] 배경 합성용 프롬프트 생성 전문가.`
  : `[Role: Naver Blog SEO & GEO Content Master]
    지시사항: ##, ### 사용, 첫 200자 결론 제시, 표(Table) 포함, 별표(*) 및 소제목 [] 사용 금지, 최종 체크리스트 포함.`;

  const prompt = `제품명: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 테마: ${inputs.backgroundLocation}`;

  // 💡 [데이터 구조]
  const schemaStr = JSON.stringify({
    globalBackgroundDNA: "string",
    title: "string",
    body: "string",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: 0, safetyIndex: 0, suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: 0 },
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
          { "role": "user", "content": `${prompt}\n\n응답은 반드시 다음 JSON 구조를 따르세요: ${schemaStr}` }
        ],
        "temperature": 0.7
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message || "텍스트 생성 실패");

    // 💡 응답 텍스트 파싱
    const content = result.choices[0].message.content;
    const rawData = JSON.parse(content || '{}');
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

    // 이미지 작업 수행
    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      const imageTasks = Array.from({ length: inputs.targetImageCount }).map((_, idx) => {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx+1}` };
        const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "surface";
        
        return generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, currentDishStyle, imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
      });
      finalImages = await Promise.all(imageTasks);
    }

    return {
      title: isImageOnly ? `${inputs.productName} 생성 결과` : rawData.title,
      content: isImageOnly ? "이미지 모드" : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages.filter(img => img.url !== ''),
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("System generation error:", e);
    throw new Error(`콘텐츠 생성 중 오류: ${e.message}`);
  }
};
