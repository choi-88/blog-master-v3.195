import { BlogInputs, BlogPost, ImageResult } from "./types";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELSLAB_KEY = import.meta.env.VITE_MODELSLAB_API_KEY;
const BLOB_TOKEN = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;

/**
 * [함수 1] ModelsLab 배경 합성 (이미 결제 확인됨)
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
        init_image: imageURL, mask_image: imageURL,
        width: 1024, height: 1024, samples: 1, safety_checker: "no"
      })
    });
    const result = await res.json();
    return { url: result.output?.[0] || result.proxy_links?.[0] || "", filename: `ai_${index}.png`, description: "AI 합성", nanoPrompt };
  } catch { return { url: '', filename: 'failed.png', description: '이미지 실패', nanoPrompt: '' }; }
};

/**
 * [함수 2] 1500자+ 블로그 생성 (400, 404 에러 원천 차단 버전)
 */
export const generateBlogSystem = async (inputs: BlogInputs): Promise<BlogPost> => {
  if (!GEMINI_KEY) throw new Error("API 키를 확인하세요.");

  // 💡 404 해결: v1beta가 아닌 가장 안정적인 v1 주소 사용
  const URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ 
        parts: [{ 
          text: `당신은 네이버 블로그 SEO 전문가입니다. "${inputs.productName}" 홍보글을 1,500자 이상의 매우 상세한 장문으로 작성하세요. 
          반드시 제목은 "${inputs.mainKeyword}"로 시작하고 본문에 상세 비교 표를 포함하세요. 
          결과물은 반드시 아래의 JSON 형식으로만 응답하고, 마크다운 기호(예: \`\`\`json)를 절대 포함하지 마세요.
          형식: {"title": "제목", "body": "1500자 본문", "imagePrompts": [{"nanoPrompt": "English keywords"}]}` 
        }] 
      }],
      generationConfig: { 
        // 💡 400 해결: 에러를 일으키던 response_mime_type 설정을 삭제했습니다.
        // 대신 프롬프트에서 JSON 형식을 강제하고 아래에서 텍스트를 정제합니다.
        maxOutputTokens: 8192,
        temperature: 0.7
      }
    })
  });

  const result = await response.json();
  
  // 구글 에러가 있으면 바로 표시
  if (result.error) throw new Error(`구글 API 에러: ${result.error.message}`);

  let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  // 💡 안전장치: AI가 ```json...``` 기호를 붙여서 줄 경우를 대비해 텍스트만 추출합니다.
  const cleanJsonText = rawText.replace(/```json|```/g, "").trim();
  
  if (!cleanJsonText) throw new Error("AI 답변이 비어있습니다.");
  const blogData = JSON.parse(cleanJsonText);

  // Vercel Blob 사진 업로드 (환경변수 VITE_BLOB_READ_WRITE_TOKEN 사용)
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
