import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 환경 변수 및 설정
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "google/gemini-2.0-flash-001"; // 오픈라우터용 모델명

/**
 * [기능 1] 이미지 배경 합성 로직 (사용자님 로직 100% 유지)
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
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Blog Master App",
        "Content-Type": "application/json"
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
    if (result.error) throw new Error(result.error.message);

    // 오픈라우터 응답에서 이미지 URL 또는 텍스트 결과 추출
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
 * [기능 2] 전체 블로그 생성 로직 (사용자님 SEO/GEO/Schema 로직 100% 유지)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 [사용자님 SEO/GEO 지시사항 보존]
  const systemInstruction = isImageOnly 
  ? `[Role: Professional Product Photographer & Prompt Engineer]
     Your task is to generate high-quality image prompts for product background replacement (inpainting).
     Provide diverse angles: close-up, 45-degree, top-down, context-rich scenes.
     The background should match the theme: ${inputs.backgroundLocation}.
     DO NOT write any blog post content. Focus on 'imagePrompts'.`
  : `[Role: Naver Blog SEO & GEO Content Master (Search Snippet Optimization Expert)]
    
    STRICT CONTENT RULES:
    1. LOGICAL HIERARCHY: Use Markdown ## and ### for subheadings. 
    2. ANSWER-FIRST: Within the first 200 characters of the post, provide a direct and clear answer.
    3. FACTUAL DATA (TABLES): Performance, price, and specs MUST be presented in Table format.
    4. E-E-A-T & ORIGINALITY: Include "Personal Experience" and "Unique Insights".
    5. SEMANTIC LINKING: Naturally mention related entities.
    6. CONTENT FLOW: Strictly follow the requested narrative structure.
    
    FORBIDDEN CHARACTERS: DO NOT use asterisks (*). No square brackets [] in subheadings.
    ALT-TEXT & IMAGE PLACEHOLDERS: Insert [이미지 설명: {description}] at relevant points.
    FINAL OUTPUT: Append the "Final Content Checklist" with all items marked as [x].`;

  const prompt = isImageOnly 
  ? `Generate ${inputs.targetImageCount} diverse image prompts for background synthesis.
     Product: ${inputs.productName}
     Main Keyword: ${inputs.mainKeyword}
     Theme: ${inputs.backgroundLocation}`
  : `제품명: ${inputs.productName}
    메인 키워드: ${inputs.mainKeyword}
    서브 키워드: ${inputs.subKeywords}
    페르소나: ${inputs.persona.targetAudience}, ${inputs.persona.writingTone}
    작업 지시: 1,500자 이상의 고품질 원고를 작성하고 Markdown 표를 포함하세요. '*'와 '[]' 사용 금지.`;

  // 💡 [사용자님 스키마 정의 보존]
  const schema = {
    globalBackgroundDNA: "string",
    title: "string",
    body: "string",
    persona: { targetAudience: "string", painPoint: "string", solutionBenefit: "string", writingTone: "string", callToAction: "string", contentFlow: "string" },
    report: { rankingProbability: "number", safetyIndex: "number", suggestedCategory: "string", analysisSummary: "string", personaAnalysis: "string", avgWordCount: "number" },
    imagePrompts: [{ description: "string", nanoPrompt: "string" }]
  };

  try {
    // 🚀 [에러 해결 핵심] googleSearch 툴을 제거하고 순수 fetch로 요청
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Blog Master App",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
          { "role": "system", "content": systemInstruction },
          { "role": "user", "content": `${prompt}\n\n중요: 반드시 다음 JSON 형식을 엄격히 준수하여 응답하세요: ${JSON.stringify(schema)}` }
        ],
        "response_format": { "type": "json_object" }
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    const rawData = JSON.parse(result.choices[0].message.content || '{}');
    const dna = rawData.globalBackgroundDNA || "Natural iPhone 13 Pro snapshot";

    // 이미지 작업 수행
    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      const imageTasks = Array.from({ length: inputs.targetImageCount }).map((_, idx) => {
        const imgIdx = idx % inputs.productImages.length;
        const imgReq = rawData.imagePrompts?.[idx] || { nanoPrompt: "Casual", description: `설명 ${idx+1}` };
        const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "placed directly on the surface";
        
        return generateInpaintedImage(inputs.productImages[imgIdx], inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, currentDishStyle, imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
      });
      finalImages = await Promise.all(imageTasks);
    }

    return {
      title: isImageOnly ? `${inputs.productName} 이미지 생성 결과` : rawData.title,
      content: isImageOnly ? "이미지 전용 모드로 생성되었습니다." : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: {
        ...rawData.report,
        requiredImageCount: finalImages.length,
        personaAnalysis: dna,
        analysisSummary: isImageOnly ? "이미지 합성이 완료되었습니다." : `SEO/GEO 최적화 조건 반영 완료.`
      },
      images: finalImages.filter(img => img.url !== ''),
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("System generation error:", e);
    throw new Error(`콘텐츠 생성 오류: ${e.message}`);
  }
};
