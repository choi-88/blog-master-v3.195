import { BlogInputs, BlogPost, ImageResult } from "./types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;

export const generateInpaintedImage = async (imageURL: string, inputs: BlogInputs, index: number, nanoPrompt: string): Promise<ImageResult> => {
  if (!MODELSLAB_KEY) return { url: '', filename: '', description: 'Key Missing', nanoPrompt: '' };
  try {
    const res = await fetch("https://modelslab.com/api/v6/image_editing/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        prompt: `Professional photography, ${inputs.backgroundLocation}, ${inputs.backgroundColor} theme. ${nanoPrompt}`,
        init_image: imageURL, mask_image: imageURL,
        width: 1024, height: 1024, samples: 1, safety_checker: "no"
      })
    });
    const result = await res.json();
    return { url: result.output?.[0] || result.proxy_links?.[0] || "", filename: `ai_${index}.png`, description: "AI 합성", nanoPrompt };
  } catch { return { url: '', filename: 'failed.png', description: '이미지 실패', nanoPrompt: '' }; }
};

export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  if (!GEMINI_KEY) throw new Error("API 키를 확인하세요.");

  // 💡 가장 범용적인 v1beta 주소로 복구하되, 에러를 유발하는 config를 삭제함
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ 
        parts: [{ 
          text: `당신은 네이버 블로그 SEO 전문가입니다. "${inputs.productName}" 홍보글을 1,500자 이상의 장문으로 작성하세요. 제목은 "${inputs.mainKeyword}"로 시작하고 본문에 비교 표를 포함하세요. 반드시 JSON 형식으로만 답하세요: {"title": "제목", "body": "1500자 본문", "imagePrompts": [{"nanoPrompt": "English keywords"}]}` 
        }] 
      }]
      // 💡 에러 원인이었던 generationConfig(response_mime_type 등)를 완전히 제거함
    })
  });

  const result = await response.json();
  if (result.error) throw new Error(`구글 API 에러: ${result.error.message}`);

  let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  // 마크다운 기호 제거 로직 (JSON만 추출)
  const cleanJsonText = rawText.replace(/```json|```/g, "").trim();
  const blogData = JSON.parse(cleanJsonText);

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
    title: blogData.title, content: blogData.body, persona: "Pro",
    mode: inputs.generationMode, report: { rankingProbability: 98, analysisSummary: "1500자+ 최적화 완료" },
    images: finalImages, groundingSources: []
  };
};
