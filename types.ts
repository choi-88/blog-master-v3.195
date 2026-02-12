
export type AiEngine = 'GEMINI' | 'CHATGPT' | 'CLAUDE';
export type GenerationMode = 'FULL' | 'IMAGE_ONLY'; // 추가: 전체 생성 vs 이미지 전용 생성
export type ImageProvider = 'MODELSLAB' | 'REPLICATE';

export interface PersonaAnswers {
  targetAudience: string;
  painPoint: string;
  solutionBenefit: string;
  writingTone: string;
  callToAction: string;
  contentFlow: string; // 추가: 원하는 글의 흐름/방향
}

export interface ProductImageData {
  data: string;
  mimeType: string;
}

export interface BlogInputs {
  productName: string;
  productLink: string;
  referenceLink: string;
  mainKeyword: string;
  subKeywords: string;
  persona: PersonaAnswers;
  backgroundLocation: string;
  backgroundColor: string;
  backgroundMaterial: string;
  backgroundDish: string;
  dishImageCount: number;
  productImages: ProductImageData[];
  targetImageCount: number;
  selectedEngine: AiEngine;
  generationMode: GenerationMode; // 추가
  customApiKey?: string;
  geminiApiKey?: string;
  modelslabApiKey?: string;
  replicateApiKey?: string;
  imageProvider?: ImageProvider;
  imageModel?: string;
  revisionComment?: string;
}

export interface ImageResult {
  url: string;
  filename: string;
  description: string;
  nanoPrompt?: string;
}

export interface DiagnosisReport {
  rankingProbability: number;
  safetyIndex: number;
  suggestedCategory: string;
  analysisSummary: string;
  requiredImageCount: number;
  personaAnalysis: string;
  avgWordCount: number;
}

export interface BlogPost {
  title: string;
  content: string;
  images: ImageResult[];
  report: DiagnosisReport;
  groundingSources?: { title: string; url: string }[];
  persona: PersonaAnswers;
  mode?: GenerationMode; // 결과 화면 제어를 위해 추가
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  RESULT = 'RESULT',
  ERROR = 'ERROR'
}

export const KOREAN_BACKGROUND_OPTIONS = [
  "성수동 힙한 카페 (노출 콘크리트와 우드 가구)",
  "판교 IT 기업 사무실 (듀얼 모니터와 개발자 책상)",
  "화이트톤 신축 아파트 거실 (오후 햇살이 들어오는 창가)",
  "감성 캠핑 차박지 (밤 조명과 우드 테이블)",
  "미니멀한 주방 (모던한 인덕션과 대리석 상판)",
  "한강 공원 돗자리 (풀밭 위 피크닉 세팅)",
  "강남 테헤란로 고층 사무실 (도심 뷰가 보이는 창가)",
  "따뜻한 분위기의 침실 (베이지색 침구와 무드등)",
  "인더스트리얼 스튜디오 (철제 가구와 빈티지 조명)",
  "깔끔한 화이트 스튜디오 (제품 촬영용 배경)",
  "모던한 인테리어의 화장실 (그레이톤 타일과 LED 거울)",
  "식탁 배경 (미드센츄리 모던 스타일)",
  "테라스 테이블 배경 (미드센츄리 모던 스타일)"
];

export const BACKGROUND_COLOR_OPTIONS = [
  { name: "내추럴 (Natural)", value: "natural/original" },
  { name: "따뜻한 (Warm/Beige)", value: "warm beige and soft yellow tones" },
  { name: "시원한 (Cool/Blue)", value: "cool blue and bright white tones" },
  { name: "레드 (Red)", value: "vibrant red and deep crimson accents" },
  { name: "그린 (Green)", value: "fresh green and botanical forest tones" },
  { name: "다크 (Dark/Modern)", value: "dark moody gray and black aesthetic" }
];

export const BACKGROUND_MATERIAL_OPTIONS = [
  { name: "원목 우드 (Wood)", value: "natural oak wood texture" },
  { name: "화이트 대리석 (Marble)", value: "luxury white marble with gray veins" },
  { name: "빈티지 콘크리트 (Concrete)", value: "industrial raw concrete surface" },
  { name: "모던 스테인리스 (Stainless)", value: "brushed stainless steel metal surface" },
  { name: "포근한 패브릭 (Fabric)", value: "soft linen fabric texture" },
  { name: "투명 유리 (Glass)", value: "reflective clear glass table top" },
  { name: "깔끔한 화이트 타일 (Tile)", value: "clean white square ceramic tiles" }
];

export const BACKGROUND_DISH_OPTIONS = [
  { name: "선택 안함 (None)", value: "placed directly on the surface" },
  { name: "깔끔한 화이트 식기 (White)", value: "minimalist clean white ceramic plate" },
  { name: "모던한 블랙 스톤 (Black)", value: "modern matte black stone-textured plate" },
  { name: "따뜻한 우드 트레이 (Wood)", value: "handcrafted rustic wooden tray" },
  { name: "고급스러운 유기 그릇 (Brass)", value: "traditional luxury golden brass (Yugi) dish" },
  { name: "감성적인 도자기 (Pottery)", value: "hand-made warm-toned pottery bowl" },
  { name: "투명한 유리 그릇 (Glass)", value: "elegant transparent glass dish" },
  { name: "빈티지 에나멜 (Enamel)", value: "retro-style white enamel plate" }
];
