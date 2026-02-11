import { GoogleGenerativeAI } from "@google/generative-ai";
import { BlogInputs, BlogPost, ImageResult } from "./types";

// Vercel에서 수정한 VITE_ 이름표를 그대로 사용합니다.
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const MODELSLAB_URL = "https://modelslab.com/api/v6/image_editing/inpaint";

const genAI = new GoogleGenerativeAI(GEMINI_KEY || "");
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * [기능 1] ModelsLab 배경 합성 (장당 5원)
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
        prompt: `Professional commercial photography, ${inputs.backgroundLocation}, ${inputs.backgroundMaterial}, ${inputs.backgroundColor} theme, 8k resolution, highly detailed. ${nanoPrompt}`,
        width: "1024",
        height: "1024",
        samples: "1",
        safety_checker: "no"
      })
    });

    const result = await response.json();
    const finalUrl = result.output?.[0] || result.proxy_links?.[0] || "";

    return {
      url: finalUrl,
      filename: `${inputs.mainKeyword}_${index + 1}.png`,
      description: "ModelsLab Generated",
      nanoPrompt: nanoPrompt
    };
  } catch (error) {
    return { url: '', filename: 'failed.png', description: '이미지 생성 실패', nanoPrompt: '' };
  }
};

/**
 * [기능 2] 모든 조건을 충족하는 텍스트 생성 및 실행
 */
export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  if (!GEMINI_KEY) throw new Error("Vercel 설정에서 VITE_GEMINI_API_KEY를 확인하세요.");

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // 💡 사용자님의 모든 조건을 때려부은 프롬프트
  const prompt = `당신은 대한민국 최고의 네이버 블로그 마케팅 전문가입니다. 
  다음 지침에 따라 "${inputs.productName}"에 대한 포스팅을 작성하세요.

  [필수 조건]
  1. 제목: 무조건 "${inputs.mainKeyword}"가 가장 처음에 나와야 함.
  2. 분량: 공백 포함 2,000자 이상의 매우 상세한 정보성 글.
  3. 구조: 
     - 서론: 첫 150자 이내에 핵심 결론을 내는 '두괄식' 작성.
     - 본문: 전문적인 분석과 사용 후기 느낌을 섞어서 작성.
     - 구성: 본문 중간에 제품 스펙이나 비교를 위한 'Markdown Table(표)'을 반드시 포함할 것.
  4. 어투: 자연스러운 블로그 말투 (~해요, ~입니다).

  [출력 형식]
  반드시 아래의 JSON 구조로만 답변하세요 (마크다운 기호 없이 순수 JSON만).
  {
    "title": "제목",
    "body": "본문 전체 내용(2000자 이상)",
    "persona": "작성자 컨셉",
    "imagePrompts": [{"nanoPrompt": "배경 합성을 위한 영어 키워드 5개"}],
    "report": { "rankingProbability": 98, "analysisSummary": "SEO 최적화 완료" }
  }`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().replace(/```json|```/g, "").trim();
    const blogData = JSON.parse(text);

    // 이미지 처리 부분 (사용자님의 원본 이미지 URL이 들어갈 자리)
    const testUrl = "https://example.com/sample-product.jpg"; 

    let finalImages: ImageResult[] = [];
    for (let i = 0; i < inputs.targetImageCount; i++) {
      const nano = blogData.imagePrompts[i]?.nanoPrompt || "luxury background";
      const imgRes = await generateInpaintedImage(testUrl, inputs, i, nano);
      if (imgRes.url) finalImages.push(imgRes);
      await sleep(3000); 
    }

    return {
      ...blogData,
      mode: inputs.generationMode,
      images: finalImages,
      groundingSources: []
    };
  } catch (e: any) {
    throw new Error(`포스팅 생성 중 에러 발생: ${e.message}`);
  }
};
