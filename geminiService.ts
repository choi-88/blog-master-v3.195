import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 통합 API 설정 (제공해주신 파이썬 샘플 규격)
const API_URL = "https://openai.apikey.run/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

/**
 * 💡 AI가 보낸 텍스트에서 ```json ... ``` 태그를 제거하는 안전 장치
 */
const extractJson = (content: string) => {
  const jsonMatch = content.match(/```json?\n?([\s\S]*?)\n?```/);
  const rawJson = jsonMatch ? jsonMatch[1] : content;
  return JSON.parse(rawJson.trim());
};

/**
 * [기능 1] 이미지 배경 합성 로직 - 사용자님 인페인팅 지시사항 100% 유지
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
 * [기능 2] 전체 블로그 생성 로직 - 사용자님 SEO/GEO/Schema 로직 완벽 보존
 */
export const generateBlogSystem = async (inputs: BlogInputs, skipImages: boolean = false): Promise<BlogPost> => {
  const isImageOnly = inputs.generationMode === 'IMAGE_ONLY';
  
  // 💡 사용자님의 소중한 SEO/GEO 지시사항 (원본 그대로 유지)
  const systemInstruction = isImageOnly 
  ? `[Role: Professional Product Photographer & Prompt Engineer] 배경 합성용 프롬프트 생성 전문가.`
  : `[Role: Naver Blog SEO & GEO Content Master]
    지시사항: ##, ### 사용, 첫 200자 결론 제시, 표(Table) 포함, 별표(*) 및 소제목 [] 사용 금지, 최종 체크리스트 포함.`;

  const prompt = `제품명: ${inputs.productName} / 키워드: ${inputs.mainKeyword} / 테마: ${inputs.backgroundLocation}`;

  // 데이터 구조 정의
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
          { "role": "user", "content": `${prompt}\n\n응답은 반드시 마크다운(backticks) 없이 순수 JSON 텍스트로만 답변하세요: ${schemaStr}` }
        ],
        "temperature": 0.7
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);

    // 💡 [해결 포인트] extractJson 함수를 사용하여 마크다운 태그가 있어도 안전하게 파싱합니다.
    const content = result.choices[0].message.content;
    const rawData = extractJson(content); 
    
    const dna = rawData.globalBackgroundDNA || "Natural snapshot";

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
      title: isImageOnly ? `${inputs.productName} 결과` : rawData.title,
      content: isImageOnly ? "이미지 모드" : rawData.body,
      persona: rawData.persona,
      mode: inputs.generationMode,
      report: rawData.report,
      images: finalImages.filter(img => img.url !== ''),
      groundingSources: [] 
    };
  } catch (e: any) {
    console.error("System generation error:", e);
    throw new Error(`콘텐츠 생성 오류: ${e.message}`);
  }
};
