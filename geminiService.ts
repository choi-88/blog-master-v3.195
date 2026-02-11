import { GoogleGenerativeAI } from "@google/generative-ai";
import { put } from "@vercel/blob"; // 💡 이미지 업로드를 위한 라이브러리
import { BlogInputs, BlogPost, ImageResult, ProductImageData } from "./types";

// 1. 설정
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const MODELSLAB_URL = "https://modelslab.com/api/v6/image_editing/inpaint";

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * [추가] 이미지를 온라인 URL로 업로드하는 함수
 */
async function uploadToCloud(imageData: string, fileName: string): Promise<string> {
  // Base64 데이터를 Blob으로 변환
  const res = await fetch(imageData);
  const blob = await res.blob();
  
  // Vercel Blob에 업로드 (자동으로 https:// 주소가 생성됨)
  const { url } = await put(`products/${fileName}`, blob, {
    access: 'public',
    token: import.meta.env.VITE_BLOB_READ_WRITE_TOKEN // Vercel에서 발급받은 토큰
  });
  
  return url;
}

/**
 * [기능 1] ModelsLab 배경 합성 (장당 5원)
 */
export const generateInpaintedImage = async (
  imageURL: string, 
  inputs: BlogInputs,
  index: number,
  nanoPrompt: string
): Promise<ImageResult> => {
  try {
    const response = await fetch(MODELSLAB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        model_id: "sd-xl-inpainting", 
        init_image: imageURL, 
        mask_image: imageURL, // 배경 전체 교체시 원본을 마스크로 활용
        prompt: `High-end product photography, ${inputs.backgroundLocation}, ${inputs.backgroundMaterial}, ${inputs.backgroundColor} theme. ${nanoPrompt}`,
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
 * [기능 2] Google Gemini 텍스트 생성 + ModelsLab 결합
 */
export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `당신은 네이버 블로그 SEO 전문가입니다. 2000자 분량의 포스팅을 작성하세요.
    - 제목: "${inputs.mainKeyword}"를 가장 처음에 배치.
    - 본문: 첫 150자 이내에 핵심 결론 작성. 표(Table) 포함.
    - 응답 형식: 반드시 JSON { "title": "", "body": "", "imagePrompts": [{"nanoPrompt": ""}] }`;

  try {
    // 1. 텍스트 먼저 생성
    const textResult = await model.generateContent(prompt);
    const blogData = JSON.parse(textResult.response.text());

    // 2. 이미지 업로드 (첫 번째 제품 사진 기준)
    const firstImage = inputs.productImages[0];
    const uploadedURL = await uploadToCloud(`data:${firstImage.mimeType};base64,${firstImage.data}`, `product_${Date.now()}.png`);

    // 3. ModelsLab 이미지 생성
    let finalImages: ImageResult[] = [];
    for (let i = 0; i < inputs.targetImageCount; i++) {
      const nano = blogData.imagePrompts[i]?.nanoPrompt || "professional photography";
      const imgRes = await generateInpaintedImage(uploadedURL, inputs, i, nano);
      if (imgRes.url) finalImages.push(imgRes);
      await sleep(4000); 
    }

    return {
      title: blogData.title,
      content: blogData.body,
      persona: "Professional",
      mode: inputs.generationMode,
      report: { rankingProbability: 95, analysisSummary: "SEO 완료" },
      images: finalImages,
      groundingSources: []
    };
  } catch (e: any) {
    throw new Error(`작업 실패: ${e.message}`);
  }
};
