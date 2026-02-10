
import { GoogleGenAI, Type } from "@google/genai";
import { BlogInputs, BlogPost, ImageResult, ProductImageData, PersonaAnswers } from "./types";

/**
 * Gemini API 클라이언트 초기화
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
    const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
    
    // 💡 오픈라우터용 모델 이름 (보유하신 리스트 중 하나로 설정)
    const modelName = "google/gemini-2.0-flash-001"; 

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "HTTP-Referer": window.location.origin, // 오픈라우터 필수 헤더
        "X-Title": "Blog Master App",          // 오픈라우터 필수 헤더
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": modelName,
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
    
    if (result.error) {
      throw new Error(result.error.message || "오픈라우터 호출 중 오류 발생");
    }

    // 오픈라우터가 반환한 데이터에서 이미지 URL 또는 응답 내용 추출
    // (참고: 모델에 따라 base64 데이터를 다시 줄 수도 있고, URL을 줄 수도 있습니다)
    let imageUrl = result.choices?.[0]?.message?.content || "";

    // 만약 응답이 URL 형태가 아니라면 적절히 처리 (보통 생성 모델은 결과물을 줍니다)
    if (!imageUrl) throw new Error("AI가 이미지 데이터를 생성하지 못했습니다.");

    return {
      url: imageUrl,
      filename: `${mainKeyword.replace(/[^\w가-힣]/g, '_')}_${index + 1}.png`,
      description: imgReq.description,
      nanoPrompt: imgReq.nanoPrompt
    };

  } catch (error: any) {
    console.error("Image generation failed:", error);
    return {
      url: '',
      filename: `failed_${index}.png`,
      description: '이미지 생성 실패',
      nanoPrompt: ''
    };
  }
};

/**
 * 전체 블로그 시스템 생성 로직 (SEO/GEO 최적화 강화)
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  const systemInstruction = isImageOnly 
  ? `[Role: Professional Product Photographer & Prompt Engineer]
     Your task is to generate high-quality image prompts for product background replacement (inpainting).
     Provide diverse angles: close-up, 45-degree, top-down, context-rich scenes.
     The background should match the theme: ${inputs.backgroundLocation}.
     DO NOT write any blog post content. Keep the 'body' and 'title' properties simple or short summaries of the images.
     Focus on providing excellent 'imagePrompts'.`
  : `[Role: Naver Blog SEO & GEO Content Master (Search Snippet Optimization Expert)]
    
    STRICT CONTENT RULES:
    1. LOGICAL HIERARCHY: Use Markdown ## and ### for subheadings. 
       - DO NOT use square brackets [] or any special characters in subheadings.
       - Use large font headers to separate context clearly.
    2. ANSWER-FIRST: Within the first 200 characters of the post, provide a direct and clear answer/conclusion to the user's search intent. This is critical for GEO (AI Overviews) optimization.
    3. FACTUAL DATA (TABLES): Performance, price, and specs MUST be presented in a Markdown Table format. Avoid vague adjectives; use specific numbers (e.g., 400W, 3 seconds).
    4. E-E-A-T & ORIGINALITY: Include "Personal Experience" and "Unique Insights" that sound like a real user. Do not repeat typical AI-style descriptions.
    5. SEMANTIC LINKING: Naturally mention related entities, competitors, or higher/lower product categories.
    6. CONTENT FLOW: If the user provides a specific "Content Flow" or direction, you MUST strictly follow that narrative structure while maintaining SEO/GEO quality.
    
    FORBIDDEN CHARACTERS:
    - DO NOT use the asterisk symbol (*) anywhere in the entire post. Not even for bolding (**), italicizing, or bullet points.
    - For bolding, use headers or context. 
    - For lists, use numbered lists (1. 2.) or hyphens (-).
    
    ALT-TEXT & IMAGE PLACEHOLDERS:
    - Insert [이미지 설명: {description}] at relevant points in the text.

    FINAL OUTPUT:
    - At the end of the post, append the "Final Content Checklist" with all items marked as [x].`;

  const prompt = isImageOnly 
  ? `Generate ${inputs.targetImageCount} diverse image prompts for background synthesis.
     Product: ${inputs.productName}
     Main Keyword: ${inputs.mainKeyword}
     Theme: ${inputs.backgroundLocation}
     Material: ${inputs.backgroundMaterial}
     Dish Style: ${inputs.backgroundDish}
     `
  : `제품명: ${inputs.productName}
    메인 키워드: ${inputs.mainKeyword}
    서브 키워드: ${inputs.subKeywords}
    참고 URL: ${inputs.referenceLink || '없음'}
    쇼핑 링크: ${inputs.productLink || 'https://shoppingconnect.co.kr/'}
    생성 이미지 수량: ${inputs.targetImageCount}
    배경 테마: ${inputs.backgroundLocation}
    배경 색감: ${inputs.backgroundColor}
    바닥 재질: ${inputs.backgroundMaterial}
    그릇 스타일: ${inputs.backgroundDish}

    [페르소나 및 흐름 설정]
    타겟 독자: ${inputs.persona.targetAudience}
    페인 포인트: ${inputs.persona.painPoint}
    핵심 혜택: ${inputs.persona.solutionBenefit}
    글의 톤: ${inputs.persona.writingTone}
    원하는 글의 흐름/방향: ${inputs.persona.contentFlow || 'AI 추천 최적 흐름'}
    CTA: ${inputs.persona.callToAction}

    작업 지시:
    1. 최적화된 콘텐츠의 5대 필수 조건을 준수하여 1,500자 이상의 고품질 원고를 작성하세요.
    2. 제목은 25자 내외로 메인 키워드를 전면에 배치하세요.
    3. 본문에 반드시 제품 정보를 요약한 Markdown 표(Table)를 포함하세요.
    4. '*' 기호와 소제목의 '[]'를 절대 사용하지 마세요.
    5. 사용자가 요청한 '원하는 글의 흐름/방향'이 있다면 이를 원고의 전개 구조에 적극 반영하세요.
    6. 본문 하단에 '최종 콘텐츠 체크리스트'를 포함하여 품질을 보증하세요.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      globalBackgroundDNA: { type: Type.STRING },
      title: { type: Type.STRING },
      body: { type: Type.STRING },
      persona: {
        type: Type.OBJECT,
        properties: {
          targetAudience: { type: Type.STRING },
          painPoint: { type: Type.STRING },
          solutionBenefit: { type: Type.STRING },
          writingTone: { type: Type.STRING },
          callToAction: { type: Type.STRING },
          contentFlow: { type: Type.STRING }
        },
        required: ["targetAudience", "painPoint", "solutionBenefit", "writingTone", "callToAction", "contentFlow"]
      },
      report: {
        type: Type.OBJECT,
        properties: {
          rankingProbability: { type: Type.NUMBER },
          safetyIndex: { type: Type.NUMBER },
          suggestedCategory: { type: Type.STRING },
          analysisSummary: { type: Type.STRING },
          personaAnalysis: { type: Type.STRING },
          avgWordCount: { type: Type.NUMBER }
        },
        required: ["rankingProbability", "safetyIndex", "suggestedCategory", "analysisSummary", "personaAnalysis", "avgWordCount"]
      },
      imagePrompts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            nanoPrompt: { type: Type.STRING }
          },
          required: ["description", "nanoPrompt"]
        }
      }
    },
    required: ["globalBackgroundDNA", "title", "body", "persona", "report", "imagePrompts"]
  };

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    
    const rawData = JSON.parse(response.text || '{}');
    const dna = rawData.globalBackgroundDNA || "Natural iPhone 13 Pro snapshot";

    let finalImages: ImageResult[] = [];
    if (!skipImages) {
      const imageTasks = Array.from({ length: inputs.targetImageCount }).map((_, idx) => {
        const imgIdx = idx % inputs.productImages.length;
        const originalImage = inputs.productImages[imgIdx];
        const imgReq = rawData.imagePrompts[idx] || { 
          nanoPrompt: "Casual snapshot", 
          description: `이미지 설명: ${idx + 1}` 
        };
        const currentDishStyle = (idx < inputs.dishImageCount) ? inputs.backgroundDish : "placed directly on the surface";
        return generateInpaintedImage(originalImage, inputs.backgroundLocation, inputs.backgroundColor, inputs.backgroundMaterial, currentDishStyle, imgReq, idx, inputs.mainKeyword || inputs.productName, dna);
      });
      const imageResults = await Promise.all(imageTasks);
      finalImages = imageResults.filter(img => img.url !== '');
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
        analysisSummary: isImageOnly ? "이미지 전용 모드로 합성이 완료되었습니다." : `SEO/GEO 최적화 5대 조건 및 사용자 요청 흐름이 반영되었습니다.`
      },
      images: finalImages,
      groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => chunk.web ? { title: chunk.web.title, url: chunk.web.uri } : null).filter(Boolean) || []
    };
  } catch (e: any) {
    console.error("System generation error:", e);
    throw new Error(`콘텐츠 생성 오류: ${e.message}`);
  }
};
