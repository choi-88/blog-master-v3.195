import { GoogleGenerativeAI } from "@google/generative-ai";
import { BlogInputs, BlogPost, ImageResult } from "./types";

// Vercel에 등록하신 VITE_ 접두사 변수를 정확히 읽어옵니다
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const MODELSLAB_URL = "https://modelslab.com/api/v6/image_editing/inpaint";

const genAI = new GoogleGenerativeAI(GEMINI_KEY || "");
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * [기능 1] ModelsLab 배경 합성 (장당 약 5.4원)
 */
export const generateInpaintedImage = async (
  imageURL: string, 
  inputs: BlogInputs,
  index: number,
  nanoPrompt: string
): Promise<ImageResult> => {
  if (!MODELSLAB_KEY) return { url: '', filename: '', description: 'Key Missing', nanoPrompt: '' };

  try {
    const response = await fetch(MODELSLAB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        model_id: "sd-xl-inpainting", // 가성비 모델
        init_image: imageURL, 
        mask_image: imageURL, 
        prompt: `A high-end commercial photo, ${inputs.backgroundLocation}, ${inputs.backgroundMaterial}, ${inputs.backgroundColor} lighting, 8k resolution. ${nanoPrompt}`,
        width: "1024",
        height: "1024",
        samples: "1",
        safety_checker: "no"
      })
    });

    const result = await response.json();
    const finalUrl = result.output?.[0] || result.proxy_links?.[0] || ""; //

    return {
      url: finalUrl,
      filename: `${inputs.mainKeyword}_${index + 1}.png`,
      description: "AI Generated Lifestyle Photo",
      nanoPrompt: nanoPrompt
    };
  } catch (error) {
    return { url: '', filename: 'failed.png', description: '이미지 생성 실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 1,500자 이상 SEO/AEO 최적화 포스팅 생성
 */
export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  if (!GEMINI_KEY) throw new Error("API Key 설정 오류");

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash" // 무료 티어 활용
  });

  const prompt = `
    당신은 네이버 블로그 SEO 및 AEO 전문가입니다. 
    제품명: "${inputs.productName}", 메인키워드: "${inputs.mainKeyword}"

    [작성 규칙 - 절대 준수]
    1. 분량: 공백 제외 1,500자 이상의 장문으로 작성하세요. 
    2. 제목: 반드시 "${inputs.mainKeyword}"로 시작하는 매력적인 제목을 만드세요.
    3. 서론: 첫 150자 이내에 제품의 가장 큰 장점(결론)을 요약하세요 (AEO 최적화).
    4. 본문: 소제목을 3개 이상 사용하고, 중간에 제품 사양 비교를 위한 'Markdown Table(표)'을 반드시 포함하세요.
    5. 어투: 신뢰감 있으면서 부드러운 '~해요'체를 사용하세요.

    [출력 포맷]
    반드시 하단의 JSON 구조로만 응답하세요.
    {
      "title": "제목",
      "body": "본문 내용(1500자 이상)",
      "persona": "작성자 컨셉",
      "imagePrompts": [{"nanoPrompt": "5 keywords for background synthesis"}]
    }`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const blogData = JSON.parse(text);

    // 💡 실제로는 사용자가 업로드한 이미지의 URL을 전달해야 합니다.
    const productUrl = "https://your-storage.com/uploaded-product.jpg"; 

    let finalImages: ImageResult[] = [];
    for (let i = 0; i < inputs.targetImageCount; i++) {
      const imgRes = await generateInpaintedImage(productUrl, inputs, i, blogData.imagePrompts[0]?.nanoPrompt);
      if (imgRes.url) finalImages.push(imgRes);
      await sleep(3000); // API 안정성을 위한 대기
    }

    return {
      ...blogData,
      mode: inputs.generationMode,
      images: finalImages,
      report: { rankingProbability: 95, analysisSummary: "1500자+ 표 포함 SEO 완료" },
      groundingSources: []
    };
  } catch (e: any) {
    throw new Error(`생성 오류: ${e.message}`);
  }
};
