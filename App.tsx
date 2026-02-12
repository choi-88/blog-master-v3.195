
import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { 
  BlogInputs, 
  BlogPost, 
  AppState, 
  PersonaAnswers,
  ProductImageData,
  KOREAN_BACKGROUND_OPTIONS,
  BACKGROUND_COLOR_OPTIONS,
  BACKGROUND_MATERIAL_OPTIONS,
  BACKGROUND_DISH_OPTIONS,
  AiEngine,
  ImageResult,
  GenerationMode
} from './types';
import { generateBlogSystem, generateInpaintedImage } from './geminiService';
import { 
  RocketLaunchIcon, 
  PhotoIcon, 
  MagnifyingGlassIcon,
  SparklesIcon,
  CloudArrowUpIcon,
  Square3Stack3DIcon,
  ArrowLeftIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  LinkIcon,
  ClipboardDocumentCheckIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  AdjustmentsVerticalIcon,
  PencilSquareIcon,
  LockClosedIcon,
  MapPinIcon,
  InformationCircleIcon,
  SquaresPlusIcon,
  SwatchIcon,
  Square2StackIcon,
  CakeIcon,
  CommandLineIcon,
  ListBulletIcon,
  FolderArrowDownIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [isPersonaExpanded, setIsPersonaExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const [inputs, setInputs] = useState<BlogInputs>({
    productName: '',
    productLink: '',
    referenceLink: '',
    mainKeyword: '',
    subKeywords: '',
    persona: {
      targetAudience: '',
      painPoint: '',
      solutionBenefit: '',
      writingTone: '친근한 정보 전달형',
      callToAction: '',
      contentFlow: ''
    },
    backgroundLocation: KOREAN_BACKGROUND_OPTIONS[0],
    backgroundColor: BACKGROUND_COLOR_OPTIONS[0].value,
    backgroundMaterial: BACKGROUND_MATERIAL_OPTIONS[0].value,
    backgroundDish: BACKGROUND_DISH_OPTIONS[0].value,
    dishImageCount: 3,
    productImages: [],
    targetImageCount: 6,
    selectedEngine: 'GEMINI',
    generationMode: 'FULL',
    revisionComment: ''
  });

  const [result, setResult] = useState<BlogPost | null>(null);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<number | null>(null);
  const [customBgInputs, setCustomBgInputs] = useState<{[key: number]: string}>({});
  const [isContentRegenerating, setIsContentRegenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '07047867000') {
      setIsAuthenticated(true);
    } else {
      alert('비밀번호가 틀렸습니다.');
      setPasswordInput('');
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setInputs(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'targetImageCount' && next.dishImageCount > (value as number)) {
        next.dishImageCount = value as number;
      }
      return next;
    });
  };

  const handlePersonaChange = (field: keyof PersonaAnswers, value: string) => {
    setInputs(prev => ({
      ...prev,
      persona: { ...prev.persona, [field]: value }
    }));
  };

  const removeImage = (index: number) => {
    setInputs(prev => ({
      ...prev,
      productImages: prev.productImages.filter((_, i) => i !== index)
    }));
  };

  const processFiles = async (files: File[]) => {
    const converted = await Promise.all(files.map(async (f) => {
      const reader = new FileReader();
      return new Promise<ProductImageData>((resolve) => {
        reader.readAsDataURL(f);
        reader.onload = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve({ data: base64String, mimeType: f.type });
        };
      });
    }));
    setInputs(prev => ({
      ...prev,
      productImages: [...prev.productImages, ...converted].slice(0, 20)
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      await processFiles(files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files) as File[];
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      await processFiles(imageFiles);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShowCopySuccess(true);
      setTimeout(() => setShowCopySuccess(false), 2000);
    });
  };

  // 프로젝트 저장 기능 (File System Access API 사용)
  const exportProject = async () => {
    try {
      const dataStr = JSON.stringify(inputs, null, 2);
      const suggestedName = `SC_Project_${inputs.productName || 'Unnamed'}_${new Date().toISOString().slice(0, 10)}.json`;

      // 최신 브라우저의 파일 저장 API 지원 여부 확인
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [{
              description: 'JSON Project File',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(dataStr);
          await writable.close();
          return; // 성공 시 종료
        } catch (err: any) {
          if (err.name === 'AbortError') return; // 사용자가 취소한 경우
          console.warn('File System API failed, falling back to download link:', err);
        }
      }

      // Fallback: 기존 다운로드 링크 방식
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', suggestedName);
      linkElement.click();
    } catch (error) {
      alert('프로젝트 저장 중 오류가 발생했습니다.');
    }
  };

  // 프로젝트 불러오기 기능 (JSON 파일 파싱)
  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // 간단한 유효성 검사 (필수 필드 확인)
        if (json.productImages !== undefined && json.persona !== undefined) {
          setInputs(json);
          alert('프로젝트를 성공적으로 불러왔습니다.');
        } else {
          alert('올바른 프로젝트 파일이 아닙니다.');
        }
      } catch (error) {
        alert('파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // 초기화
  };

  const startGeneration = async () => {
    if (inputs.generationMode === 'FULL') {
      if (!inputs.productName || !inputs.mainKeyword) return alert('제품명과 메인 키워드를 입력해주세요.');
    } else {
      if (!inputs.productName) return alert('제품명을 입력해주세요.');
    }
    if (inputs.productImages.length === 0) return alert('제품 사진을 최소 1장 이상 업로드해주세요.');

    setAppState(AppState.ANALYZING);
    try {
      const data = await generateBlogSystem(inputs);
      setResult(data);
      if (data.mode === 'FULL') {
        setInputs(prev => ({ ...prev, persona: data.persona }));
      }
      setAppState(AppState.RESULT);
    } catch (error: any) {
      console.error(error);
      setAppState(AppState.IDLE);
      alert(`콘텐츠 생성 중 오류 발생: ${error.message}`);
    }
  };

  const regenerateContentOnly = async () => {
    if (!result) return;
    setIsContentRegenerating(true);
    try {
      const data = await generateBlogSystem(inputs, true);
      setResult(prev => {
        if (!prev) return data;
        return {
          ...data,
          images: prev.images
        };
      });
      setInputs(prev => ({ ...prev, persona: data.persona }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      console.error(error);
      alert(`원고 재생성 중 오류 발생: ${error.message}`);
    } finally {
      setIsContentRegenerating(false);
    }
  };


  const toUint8ArrayFromImageUrl = async (url: string): Promise<Uint8Array> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  };

  const downloadAllAsZip = async () => {
    if (!result) return;

    try {
      const zip = new JSZip();
      if (result.mode === 'FULL') {
        zip.file("blog_content.txt", `${result.title}\n\n${result.content}`);
      }
      const imgFolder = zip.folder("images");

      await Promise.all(
        result.images.map(async (img, idx) => {
          if (!img.url) return;
          const imageBytes = await toUint8ArrayFromImageUrl(img.url);
          imgFolder?.file(img.filename || `image_${idx + 1}.png`, imageBytes);
        })
      );

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${(inputs.mainKeyword || inputs.productName).replace(/\s/g, '_')}_package.zip`;
      link.click();
    } catch (error: any) {
      alert(`이미지 ZIP 저장 중 오류 발생: ${error?.message || 'unknown error'}`);
    }
  };

  const downloadSingleImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`이미지 다운로드 실패: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error: any) {
      alert(`이미지 저장 중 오류 발생: ${error?.message || 'unknown error'}`);
    }
  };

  const regenerateSingleImage = async (index: number, customBg?: string) => {
    if (!result || isRegenerating !== null) return;
    
    const originalImage = inputs.productImages[index % inputs.productImages.length];
    if (!originalImage) return;

    setIsRegenerating(index);
    try {
      const imgReq = {
        nanoPrompt: customBg ? `Natural indoor scene with ${customBg}. iPhone snapshot style.` : "High quality commercial photography, iPhone snapshot style",
        description: customBg ? `${customBg} 배경으로 재생성된 이미지` : (result.images[index]?.description || "다시 생성된 이미지")
      };
      
      const newImg = await generateInpaintedImage(
        originalImage,
        customBg || inputs.backgroundLocation,
        inputs.backgroundColor,
        inputs.backgroundMaterial,
        inputs.backgroundDish,
        imgReq,
        index,
        inputs.mainKeyword || inputs.productName,
        result.report.personaAnalysis || "Amateur iPhone look"
      );

      if (newImg.url) {
        setResult(prev => {
          if (!prev) return null;
          const updatedImages = [...prev.images];
          updatedImages[index] = newImg;
          return { ...prev, images: updatedImages };
        });
      } else {
        alert("이미지 재생성에 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("이미지 재생성 중 오류가 발생했습니다.");
    } finally {
      setIsRegenerating(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans text-black">
        <div className="max-w-md w-full bg-white rounded-[3rem] shadow-2xl p-12 text-center border border-slate-100 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-indigo-100">
            <LockClosedIcon className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">ShoppingConnect</h1>
          <p className="text-slate-400 font-bold text-sm mb-10 uppercase tracking-widest leading-none">Security Authentication</p>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">Access Password</label>
              <input 
                type="password" 
                className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 font-bold outline-none transition-all text-center tracking-[0.5em] text-black" 
                placeholder="••••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
              />
            </div>
            <button 
              type="submit" 
              className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              시스템 접속하기 <RocketLaunchIcon className="w-6 h-6" />
            </button>
          </form>
          
          <p className="mt-8 text-[10px] text-slate-300 font-bold uppercase tracking-widest">Authorized Personnel Only</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-24 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      {showCopySuccess && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3">
            <CheckCircleIcon className="w-6 h-6 text-emerald-400" />
            <span className="font-black">복사 완료!</span>
          </div>
        </div>
      )}

      <header className="bg-white/80 border-b sticky top-0 z-50 backdrop-blur-xl h-20 flex items-center px-10 justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
            <RocketLaunchIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="font-black text-2xl tracking-tight block">ShoppingConnect</span>
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest leading-none">V6.8 SEO & SEDA ENGINE</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 pt-12">
        {appState === AppState.IDLE && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8 space-y-12">
              
              {inputs.generationMode === 'FULL' && (
                <>
                  <section className="bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100 relative overflow-hidden animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-3 mb-10">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <MagnifyingGlassIcon className="w-6 h-6 text-indigo-600" />
                      </div>
                      <h2 className="text-2xl font-black">기획 정보 및 참고 분석</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">제품명 (USP 포함)</label>
                        <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold outline-none shadow-sm text-black" value={inputs.productName} onChange={(e) => handleInputChange('productName', e.target.value)} placeholder="예: 무선 노이즈캔슬링 헤드셋 v2" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">메인 키워드 (SEO 최적화)</label>
                        <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold outline-none shadow-sm text-black" value={inputs.mainKeyword} onChange={(e) => handleInputChange('mainKeyword', e.target.value)} placeholder="예: 무선헤드셋추천" />
                      </div>
                      <div className="md:col-span-2 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">분석용 참고 블로그 URL</label>
                        <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black" value={inputs.referenceLink} onChange={(e) => handleInputChange('referenceLink', e.target.value)} placeholder="https://blog.naver.com/..." />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">서브 키워드</label>
                        <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black" value={inputs.subKeywords} onChange={(e) => handleInputChange('subKeywords', e.target.value)} placeholder="가성비헤드셋, 입학선물 등" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">쇼핑커넥트 제품 URL</label>
                        <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black" value={inputs.productLink} onChange={(e) => handleInputChange('productLink', e.target.value)} placeholder="https://shoppingconnect.co.kr/..." />
                      </div>
                    </div>
                  </section>

                  <section className="bg-white rounded-[3rem] shadow-xl p-12 border border-slate-50 animate-in slide-in-from-top-4 duration-500">
                    <button onClick={() => setIsPersonaExpanded(!isPersonaExpanded)} className="w-full flex items-center justify-between group">
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                          <UserGroupIcon className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-black text-black">타겟 페르소나 설정</h2>
                          <p className="text-xs text-indigo-400 font-bold tracking-tight">AI가 참고 URL과 USP를 분석하여 최적의 페르소나를 도출합니다.</p>
                        </div>
                      </div>
                      <AdjustmentsVerticalIcon className={`w-8 h-8 text-slate-300 transition-transform ${isPersonaExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isPersonaExpanded && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 animate-in slide-in-from-top-4">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">1. 타겟 독자</label>
                          <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black font-bold" value={inputs.persona.targetAudience} onChange={(e) => handlePersonaChange('targetAudience', e.target.value)} placeholder="예: 야외활동이 잦은 30대 남성" />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">2. 주요 고민(Pain Point)</label>
                          <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black font-bold" value={inputs.persona.painPoint} onChange={(e) => handlePersonaChange('painPoint', e.target.value)} placeholder="예: 시끄러운 지하철 소음" />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">3. 솔루션 & 핵심 혜택</label>
                          <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black font-bold" value={inputs.persona.solutionBenefit} onChange={(e) => handlePersonaChange('solutionBenefit', e.target.value)} placeholder="예: 40dB 노이즈 캔슬링" />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">4. 문체 스타일</label>
                          <select className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-black" value={inputs.persona.writingTone} onChange={(e) => handlePersonaChange('writingTone', e.target.value)}>
                            <option>친근한 정보 전달형</option>
                            <option>전문적인 리뷰어 스타일</option>
                            <option>감성적인 브이로그 느낌</option>
                            <option>재치있고 트렌디한 문체</option>
                          </select>
                        </div>
                        <div className="md:col-span-2 space-y-3">
                          <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest flex items-center gap-1 font-bold">
                            <ListBulletIcon className="w-3 h-3" /> 원하는 글의 흐름/방향 (선택)
                          </label>
                          <textarea 
                            className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black h-24 resize-none font-bold" 
                            value={inputs.persona.contentFlow} 
                            onChange={(e) => handlePersonaChange('contentFlow', e.target.value)} 
                            placeholder="예: 초반에는 제품의 언박싱 느낌을 강조하고, 중반에는 실사용 테스트 데이터 위주로, 마지막에는 가격 대비 가성비를 강조해주세요." 
                          />
                        </div>
                        <div className="md:col-span-2 space-y-3">
                          <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">5. 최종 행동 유도(CTA)</label>
                          <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-black font-bold" value={inputs.persona.callToAction} onChange={(e) => handlePersonaChange('callToAction', e.target.value)} placeholder="예: 지금 바로 링크 확인" />
                        </div>
                      </div>
                    )}
                  </section>
                </>
              )}

              <section className="bg-white rounded-[3rem] shadow-xl p-12 border border-slate-50 space-y-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                    <CloudArrowUpIcon className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-black text-black">제품 사진 업로드 (최대 20장)</h2>
                </div>

                {inputs.generationMode === 'IMAGE_ONLY' && (
                  <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 animate-in fade-in duration-500">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">이미지 생성용 제품명 (필수)</label>
                      <input 
                        className="w-full p-5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold outline-none shadow-sm text-black" 
                        value={inputs.productName} 
                        onChange={(e) => handleInputChange('productName', e.target.value)} 
                        placeholder="예: 블랙 세라믹 머그컵" 
                      />
                      <p className="text-[10px] text-slate-400 font-bold pl-1 italic">이미지 전용 모드에서는 기획 정보 대신 제품명만 입력하여 간편하게 생성합니다.</p>
                    </div>
                  </div>
                )}
                
                <div 
                  onClick={() => fileInputRef.current?.click()} 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-4 border-dashed rounded-[3rem] p-12 transition-all cursor-pointer text-center group ${isDragging ? 'bg-indigo-50 border-indigo-400' : 'bg-slate-50 border-slate-100 hover:bg-white hover:border-indigo-200'}`}
                >
                  <PhotoIcon className={`w-16 h-16 mx-auto mb-4 transition-transform group-hover:scale-110 ${isDragging ? 'text-indigo-500 scale-110' : 'text-slate-300'}`} />
                  <p className="text-lg font-black text-slate-800">제품 사진을 클릭하거나 드래그하여 업로드하세요</p>
                  <p className="text-xs text-slate-400 mt-2 font-bold italic">업로드된 사진 수에 따라 다양한 각도로 배경 합성이 진행됩니다</p>
                  <input type="file" multiple hidden ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
                </div>

                {inputs.productImages.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {inputs.productImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-[1.5rem] overflow-hidden border border-slate-100 group shadow-sm">
                        <img src={`data:${img.mimeType};base64,${img.data}`} className="w-full h-full object-cover" alt={`Upload ${idx}`} />
                        <button onClick={(e) => { e.stopPropagation(); removeImage(idx); }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg active:scale-90">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="lg:col-span-4 space-y-12">
              <section className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-50 sticky top-28">
                
                {/* 프로젝트 관리 (저장/불러오기) */}
                <div className="mb-8 text-black">
                   <div className="flex items-center gap-2 mb-4">
                      <FolderArrowDownIcon className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-black text-base">프로젝트 관리 (저장/불러오기)</h3>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={exportProject}
                        className="flex items-center justify-center gap-2 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-[10px] hover:bg-black transition-all shadow-md active:scale-95"
                      >
                        <ArrowUpTrayIcon className="w-4 h-4" /> 현재 설정 저장
                      </button>
                      <button 
                        onClick={() => projectImportRef.current?.click()}
                        className="flex items-center justify-center gap-2 py-3.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-2xl font-black text-[10px] hover:bg-indigo-100 transition-all shadow-sm active:scale-95"
                      >
                        <FolderArrowDownIcon className="w-4 h-4" /> 프로젝트 로드
                      </button>
                      <input type="file" hidden ref={projectImportRef} accept=".json" onChange={importProject} />
                   </div>
                   <p className="text-[9px] text-slate-400 mt-3 font-bold text-center italic">작성 중인 원고 기획과 사진 업로드 내역을 파일로 보관하세요.</p>
                </div>

                <div className="mb-8 text-black">
                   <div className="flex items-center gap-2 mb-4">
                      <CommandLineIcon className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-black text-base">생성 모드 선택</h3>
                   </div>
                   <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                      <button 
                        onClick={() => handleInputChange('generationMode', 'FULL')}
                        className={`py-3 rounded-xl font-black text-[10px] transition-all ${inputs.generationMode === 'FULL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        원고 + 이미지
                      </button>
                      <button 
                        onClick={() => handleInputChange('generationMode', 'IMAGE_ONLY')}
                        className={`py-3 rounded-xl font-black text-[10px] transition-all ${inputs.generationMode === 'IMAGE_ONLY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        이미지만 생성
                      </button>
                   </div>
                </div>

                <div className="mb-6 text-black">
                   <div className="flex items-center gap-2 mb-3">
                      <SquaresPlusIcon className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-black text-base">전체 이미지 생성 수량</h3>
                   </div>
                   <div className="grid grid-cols-5 gap-2">
                      {[3, 6, 9, 12, 15].map(count => (
                        <button 
                          key={count} 
                          onClick={() => handleInputChange('targetImageCount', count)}
                          className={`py-2.5 rounded-xl font-black text-xs transition-all border-2 ${inputs.targetImageCount === count ? 'bg-indigo-600 text-white border-transparent shadow-md' : 'bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                        >
                          {count}장
                        </button>
                      ))}
                   </div>
                </div>

                <div className="mb-8 text-black">
                   <div className="flex items-center gap-2 mb-3">
                      <CakeIcon className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-black text-base">그릇 적용 사진 수량</h3>
                   </div>
                   <div className="grid grid-cols-6 gap-2">
                      {[0, 1, 2, 3, 4, 5].map(count => (
                        <button 
                          key={count} 
                          disabled={count > inputs.targetImageCount}
                          onClick={() => handleInputChange('dishImageCount', count)}
                          className={`py-2 rounded-xl font-black text-xs transition-all border-2 ${inputs.dishImageCount === count ? 'bg-indigo-600 text-white border-transparent shadow-md' : 'bg-slate-50 text-slate-500 hover:border-slate-200'} disabled:opacity-20 disabled:cursor-not-allowed`}
                        >
                          {count === 0 ? '안함' : count}
                        </button>
                      ))}
                   </div>
                </div>

                <div className="mb-8 text-black">
                  <div className="flex items-center gap-2 mb-4">
                    <SwatchIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-base">배경 색감 선택</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_COLOR_OPTIONS.map(color => (
                      <button 
                        key={color.value} 
                        onClick={() => handleInputChange('backgroundColor', color.value)}
                        className={`py-2.5 px-2 rounded-xl font-black text-[10px] transition-all border-2 ${inputs.backgroundColor === color.value ? 'bg-slate-900 text-white border-transparent shadow-md' : 'bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                      >
                        {color.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-8 text-black">
                  <div className="flex items-center gap-2 mb-4">
                    <Square2StackIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-base">바닥/테이블 재질 선택</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_MATERIAL_OPTIONS.map(material => (
                      <button 
                        key={material.value} 
                        onClick={() => handleInputChange('backgroundMaterial', material.value)}
                        className={`py-2.5 px-2 rounded-xl font-black text-[10px] transition-all border-2 ${inputs.backgroundMaterial === material.value ? 'bg-slate-900 text-white border-transparent shadow-md' : 'bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                      >
                        {material.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-10 text-black">
                  <div className="flex items-center gap-2 mb-4">
                    <CakeIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-base">그릇 스타일 (음식 제품용)</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_DISH_OPTIONS.map(dish => (
                      <button 
                        key={dish.value} 
                        onClick={() => handleInputChange('backgroundDish', dish.value)}
                        className={`py-2.5 px-2 rounded-xl font-black text-[10px] transition-all border-2 ${inputs.backgroundDish === dish.value ? 'bg-indigo-600 text-white border-transparent shadow-md' : 'bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                      >
                        {dish.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-6 text-black">
                  <Square3Stack3DIcon className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-black text-base">기본 배경 합성 테마</h3>
                </div>
                <select 
                  value={inputs.backgroundLocation}
                  onChange={(e) => handleInputChange('backgroundLocation', e.target.value)}
                  className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-xs"
                >
                  {KOREAN_BACKGROUND_OPTIONS.map(bg => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>

                <div className="mt-8 pt-8 border-t border-slate-100">
                  <button onClick={startGeneration} className="w-full py-6 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xl flex items-center justify-center gap-4 shadow-xl hover:bg-indigo-700 active:scale-95 group">
                    {inputs.generationMode === 'FULL' ? 'AI 자동 생성 시작' : 'AI 이미지 생성 시작'} <SparklesIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {appState === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center py-48 gap-12 text-center text-black">
            <div className="relative">
              <div className="w-32 h-32 border-[14px] border-slate-100 border-t-indigo-600 rounded-full animate-spin shadow-2xl" />
              <div className="absolute inset-0 flex items-center justify-center"><SparklesIcon className="w-10 h-10 text-indigo-600" /></div>
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                {inputs.generationMode === 'FULL' ? 'SEO/GEO 최적화 중...' : '이미지 합성 로직 가동 중...'}
              </h2>
              <p className="text-slate-400 font-bold italic text-xl max-w-lg mx-auto leading-relaxed">
                {inputs.generationMode === 'FULL' 
                  ? '5대 필수 조건(표 데이터, Answer-First)을 준수하여 원고를 작성하고 있습니다.' 
                  : `선택하신 배경과 재질에 맞춰 고품질 제품 이미지를 생성하고 있습니다.${inputs.dishImageCount > 0 ? ` (그릇 합성 ${inputs.dishImageCount}장 포함)` : ''}`} (약 40~90초 소요)
              </p>
            </div>
          </div>
        )}

        {appState === AppState.RESULT && result && (
          <div className="space-y-12 animate-in fade-in duration-1000">
             <div className="flex items-center justify-between">
                <button onClick={() => setAppState(AppState.IDLE)} className="flex items-center gap-2 font-black text-slate-400 hover:text-indigo-600 group">
                  <div className="w-10 h-10 bg-white border rounded-xl flex items-center justify-center group-hover:-translate-x-1 shadow-sm">
                    <ArrowLeftIcon className="w-5 h-5" />
                  </div>
                  처음 단계로
                </button>
                <div className="flex items-center gap-4">
                  <button onClick={downloadAllAsZip} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl active:scale-95">
                    <ArrowDownTrayIcon className="w-5 h-5" /> 전체 다운로드 (ZIP)
                  </button>
                  {result.mode === 'FULL' && (
                    <button onClick={() => copyToClipboard(result.content)} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl active:scale-95">
                      <ClipboardDocumentCheckIcon className="w-5 h-5" /> 원고 복사
                    </button>
                  )}
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className={`space-y-8 ${result.mode === 'FULL' ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
                  {result.mode === 'FULL' && (
                    <>
                      {isContentRegenerating && (
                        <div className="bg-indigo-600 text-white p-6 rounded-3xl flex items-center justify-center gap-3 font-black animate-pulse shadow-xl">
                          <ArrowPathIcon className="w-6 h-6 animate-spin" /> SEO/GEO 로직을 재검토하여 원고를 다시 작성 중입니다...
                        </div>
                      )}
                      <section className="bg-white rounded-[4rem] shadow-2xl p-16 border border-white relative text-black">
                        <div className="mb-12 flex items-center gap-3">
                          <DocumentTextIcon className="w-8 h-8 text-indigo-600" />
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">SEO & GEO Optimized Content</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 mb-16 leading-tight">{result.title}</h1>
                        <div className="prose prose-slate max-w-none font-medium text-xl leading-relaxed text-slate-700 whitespace-pre-wrap">{result.content}</div>
                      </section>
                    </>
                  )}
                  
                  <section className="bg-white rounded-[4rem] shadow-2xl p-16 border border-white space-y-12">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-black">
                          <PhotoIcon className="w-10 h-10 text-indigo-600" />
                          <h2 className="text-3xl font-black tracking-tight">아이폰 스냅 감성 결과물 ({result.images.length})</h2>
                        </div>
                     </div>
                     <div className={`grid grid-cols-1 gap-12 ${result.mode === 'FULL' ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                        {result.images.map((img, idx) => (
                          <div key={idx} className="space-y-6 group">
                             <div className="relative aspect-[4/3] rounded-[2.5rem] overflow-hidden border shadow-2xl group-hover:shadow-indigo-100 group-hover:ring-4 group-hover:ring-indigo-50 transition-all">
                                <img src={img.url} className="w-full h-full object-cover duration-700 group-hover:scale-105" alt={img.filename} />
                                {isRegenerating === idx && (
                                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-10">
                                    <div className="flex flex-col items-center gap-4 text-white">
                                      <ArrowPathIcon className="w-12 h-12 animate-spin" />
                                      <span className="font-black text-sm">배경 합성 중...</span>
                                    </div>
                                  </div>
                                )}
                                <div className="absolute top-6 right-6 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                  <button onClick={() => downloadSingleImage(img.url, img.filename)} className="p-3 bg-white/90 backdrop-blur text-slate-900 rounded-2xl shadow-xl hover:bg-slate-900 hover:text-white active:scale-90">
                                    <ArrowDownTrayIcon className="w-6 h-6" />
                                  </button>
                                </div>
                             </div>
                             
                             <div className="px-4 space-y-4">
                                <p className="text-base font-bold text-slate-600 border-l-4 border-indigo-100 pl-4 italic">"{img.description}"</p>
                                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4 shadow-inner">
                                  <div className="flex items-center gap-2 mb-1">
                                    <MapPinIcon className="w-4 h-4 text-indigo-500" />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">배경 직접 지정 재생성</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <input 
                                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 text-black"
                                      placeholder="예: 눈 내리는 창가"
                                      value={customBgInputs[idx] || ''}
                                      onChange={(e) => setCustomBgInputs(prev => ({...prev, [idx]: e.target.value}))}
                                    />
                                    <button 
                                      onClick={() => regenerateSingleImage(idx, customBgInputs[idx])}
                                      disabled={isRegenerating !== null}
                                      className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 active:scale-90 disabled:opacity-50"
                                    >
                                      <ArrowPathIcon className="w-5 h-5" />
                                    </button>
                                  </div>
                                </div>
                             </div>
                          </div>
                        ))}
                     </div>
                  </section>
                </div>

                {result.mode === 'FULL' && (
                  <div className="lg:col-span-4 space-y-8">
                    <section className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 space-y-8 text-black">
                      <div className="flex items-center gap-3">
                        <PencilSquareIcon className="w-8 h-8 text-indigo-600" />
                        <h3 className="font-black text-xl">수정 요청 및 원고 재생성</h3>
                      </div>
                      
                      <div className="space-y-6">
                        <textarea 
                          className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold h-32 resize-none outline-none focus:ring-4 focus:ring-indigo-100 text-black" 
                          placeholder="예: 조금 더 감성적인 문체를 섞어주세요..."
                          value={inputs.revisionComment}
                          onChange={(e) => handleInputChange('revisionComment', e.target.value)}
                        />
                        <button 
                          onClick={regenerateContentOnly} 
                          disabled={isContentRegenerating}
                          className="w-full py-6 bg-indigo-600 text-white rounded-[1.5rem] font-black flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 shadow-xl shadow-indigo-100"
                        >
                          <SparklesIcon className="w-6 h-6" /> 수정 사항 반영하여 원고 다시 쓰기
                        </button>
                      </div>
                    </section>

                    <section className="bg-indigo-600 text-white rounded-[3rem] p-10 shadow-2xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 duration-500">
                          <ChartBarIcon className="w-32 h-32" />
                       </div>
                       <h3 className="font-black text-xl mb-6 flex items-center gap-2">SEO/GEO 전략 리포트</h3>
                       <div className="space-y-6 relative z-10">
                          <div className="flex justify-between items-end border-b border-indigo-500/50 pb-4">
                             <span className="text-xs font-black text-white/60 uppercase tracking-widest">상위 노출 확률</span>
                             <span className="text-4xl font-black">{result.report.rankingProbability}%</span>
                          </div>
                          <p className="text-sm font-bold text-indigo-50 bg-white/10 p-5 rounded-3xl border border-white/10 shadow-inner">
                            {result.report.analysisSummary}
                          </p>
                       </div>
                    </section>

                    <section className="bg-slate-900 text-white rounded-[3rem] p-10 shadow-2xl border border-slate-800">
                       <h3 className="font-black text-xl mb-8 flex items-center gap-2">
                         <ShieldCheckIcon className="w-6 h-6 text-emerald-400" /> SEDA 분석 DNA
                       </h3>
                       <div className="space-y-3">
                          <div className="p-5 bg-white/5 rounded-3xl text-xs font-bold text-indigo-100 italic border border-white/5 shadow-inner">
                            "{result.report.personaAnalysis}"
                          </div>
                          <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] text-center pt-4 border-t border-white/5">iPhone 13 Pro Snap Algorithm Applied</p>
                       </div>
                    </section>
                  </div>
                )}
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
