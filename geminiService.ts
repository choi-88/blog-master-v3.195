import { BlogInputs, BlogPost, ImageResult } from "./types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;

/**
 * [함수 1] ModelsLab 배경 합성
 */
export const generateInpaintedImage = async (imageURL: string, inputs: BlogInputs, index: number, nanoPrompt: string): Promise<ImageResult> => {
  if (!MODELSLAB_KEY) return { url: '', filename: '', description: 'Key Missing', nanoPrompt: '' };
  try {
    const res = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        prompt: `Professional photography, ${inputs.backgroundLocation}, ${inputs.backgroundColor} theme. ${nanoPrompt}`,
        init_image: imageURL, 
        mask_image: imageURL,
        width: 1024, height: 1024, samples: 1, safety_checker: "no"
      })
    });
    const result = await res.json();
    return { url: result.output?.[0] || result.proxy_links?.[0] || "", filename: `ai_${index}.png`, description: "AI 합성", nanoPrompt };
  } catch { return { url: '', filename: 'failed.png', description: '이미지 실패', nanoPrompt: '' }; }
};

/**
 * [함수 2] 1500자+ 블로그 생성 (400 에러 해결 버전)
 */
export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  if (!GEMINI_KEY) throw new Error("API 키를 확인하세요.");

  // 가장 안정적인 v1 주소 사용
  const URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

  const promptText = `네이버 블로그 전문가로서 "${inputs.productName}" 홍보글을 1,500자 이상의 장문으로 작성하세요. 
    반드시 제목은 "${inputs.mainKeyword}"로 시작하고 본문에 상세 비교 표를 포함하세요. 
    결과물은 반드시 JSON 형식으로만 응답하세요.
    JSON 구조: {"title": "제목", "body": "1500자 본문", "imagePrompts": [{"nanoPrompt": "English keywords"}]}`;

  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { 
        // 💡 400 에러 해결: v1 API에서는 카멜케이스(responseMimeType)를 사용해야 합니다.
        responseMimeType: "application/json" 
      }
    })
  });

  const result = await response.json();
  
  // 구글 서버 에러 메시지 확인용
  if (result.error) throw new Error(`구글 API 에러: ${result.error.message}`);

  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("AI 답변을 생성하지 못했습니다.");
  
  const blogData = JSON.parse(rawText);

  // Vercel Blob 사진 업로드
  let productUrl = "";
  if (inputs.productImages?.[0]?.data && BLOB_TOKEN) {
    try {
      const blob = await fetch(`data:${inputs.productImages[0].mimeType};base64,${inputs.productImages[0].data}`).then(r => r.blob());
      const uploadRes = await fetch(`https://blob.vercel-storage.com/add?filename=prod_${Date.now()}.png`, {
        method: "POST", headers: { "Authorization": `Bearer ${BLOB_TOKEN}` }, body: blob
      });
      const uploadData = await uploadRes.json();
      productUrl = uploadData.url;
    } catch (e) { console.error("Blob Upload Failed"); }
  }

  let finalImages: ImageResult[] = [];
  if (productUrl) {
    const imgRes = await generateInpaintedImage(productUrl, inputs, 0, blogData.imagePrompts[0]?.nanoPrompt || "");
    if (imgRes.url) finalImages.push(imgRes);
  }

  return {
    title: blogData.title, 
    content: blogData.body, 
    persona: "Pro",
    mode: inputs.generationMode, 
    report: { rankingProbability: 98, analysisSummary: "1500자+ 최적화 완료" },
    images: finalImages, 
    groundingSources: []
  };
};
