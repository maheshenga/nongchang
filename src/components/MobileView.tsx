import { Camera, MapPin, Send, Droplet, Sun, Wind, CheckCircle2, Bookmark, Wifi, WifiOff, RefreshCw, ScanLine, XCircle, Mic, Database, Sparkles, Loader2, X, FileText, User, ChevronRight, QrCode, Share2, Download, Settings as SettingsIcon, Smartphone as DeviceIcon, WalletCards, HelpCircle, Calendar, CalendarCheck2, Clock, Check, MessageSquare, Leaf } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function MobileView() {
  const [showPoster, setShowPoster] = useState(false);
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const posterCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleGeneratePoster = () => {
    setIsGeneratingPoster(true);
    setTimeout(() => {
      setIsGeneratingPoster(false);
      setShowPoster(true);
      // Simulate drawing on canvas
      setTimeout(() => {
        const canvas = posterCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Draw a mock poster
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Header gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 150);
            gradient.addColorStop(0, '#059669'); // emerald-600
            gradient.addColorStop(1, '#065f46'); // emerald-800
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, 150);
            
            // Title
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px Inter, sans-serif';
            ctx.fillText('官方溯源档案', 40, 70);
            ctx.font = '16px Inter, sans-serif';
            ctx.fillText('高山有机春白芍', 40, 105);
            
            // Card
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0,0,0,0.1)';
            ctx.shadowBlur = 20;
            ctx.fillRect(20, 120, canvas.width - 40, 300);
            ctx.shadowColor = 'transparent';
            
            // Batch Info
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 20px Inter';
            ctx.fillText('批次代码: ' + scannedBatch, 40, 160);
            
            ctx.fillStyle = '#4b5563';
            ctx.font = '14px Inter';
            ctx.fillText('产地: 云南大理 A区', 40, 200);
            ctx.fillText('质检状态: 合格保真', 40, 230);
            ctx.fillText('上链时间: 2026.06.08', 40, 260);
            ctx.fillText('区块链哈希:', 40, 290);
            
            ctx.fillStyle = '#059669';
            ctx.font = '12px Courier New';
            ctx.fillText('0x8F92A2C...83B1C', 40, 310);
            
            // QR Code Mock
            ctx.fillStyle = '#f3f4f6';
            ctx.fillRect(canvas.width - 120, 320, 80, 80);
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(canvas.width - 110, 330, 60, 60);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('扫码核验', canvas.width - 115, 360);
            
            // Footer
            ctx.fillStyle = '#10b981'; // emerald-500
            ctx.font = 'bold 18px Inter';
            ctx.fillText('品质保证 · 一物一码', canvas.width/2 - 80, 480);
          }
        }
      }, 100);
    }, 800);
  };

  const [mobileTab, setMobileTab] = useState<'work' | 'trace' | 'me'>('work');
  const [isAppAuthenticated, setIsAppAuthenticated] = useState(false);
  const [isAppRegistering, setIsAppRegistering] = useState(false);
  const [showTraceResult, setShowTraceResult] = useState(false);
  const [themeTheme, setThemeTheme] = useState<'emerald' | 'purple'>('emerald');
  
  const [recordNotes, setRecordNotes] = useState('');
  const [inputCost, setInputCost] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [offlineRecordData, setOfflineRecordData] = useState<{batchId: string, notes: string, inputCost: number, laborCost: number}[]>([]); 
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPatrolling, setIsPatrolling] = useState(false);
  
  const [offlineScans, setOfflineScans] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'scan' | 'photo' | 'ai'>('scan');
  const [scannedBatch, setScannedBatch] = useState('...');
  const [photoCaptured, setPhotoCaptured] = useState(false);
  
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  
  // Voice Assistant State
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const [voiceQuery, setVoiceQuery] = useState('');
  const [voiceResponse, setVoiceResponse] = useState<string | null>(null);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isVoiceThinking, setIsVoiceThinking] = useState(false);

  // Task Board Tasks
  const [todoTasks, setTodoTasks] = useState([
    { id: 1, type: '施肥', target: '高山温室A区', time: '10:00 AM', status: 'pending', desc: '追施芍药专用缓释肥' },
    { id: 2, type: '浇水', target: '露地B区', time: '14:30 PM', status: 'pending', desc: '巡查并补水浇灌' },
    { id: 3, type: '采摘', target: '梯田C区', time: '16:00 PM', status: 'pending', desc: '成花期抽样剪切' }
  ]);
  const [checkingTask, setCheckingTask] = useState<number | null>(null);
  const [showReviewModal, setShowReviewModal] = useState<number | null>(null);

  const handleTaskCheckIn = (id: number) => {
    setCheckingTask(id);
    const task = todoTasks.find(t => t.id === id);
    setTimeout(() => {
      setTodoTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t));
      setCheckingTask(null);
      if (task && !isOffline) {
        window.dispatchEvent(new CustomEvent('farm-record-added', { 
           detail: { 
             batchId: 'ORC-2026-001', 
             inputCost: 20,
             laborCost: 0.5,
             type: task.type,
             desc: `快速打卡: ${task.desc}`
           } 
        }));
      } else if (task && isOffline) {
        setOfflineRecordData(prev => [...prev, { batchId: 'ORC-2026-001', notes: `快速打卡: ${task.desc}`, inputCost: 20, laborCost: 0.5 }]);
      }
    }, 1200);
  };

  const simulateVoiceAssistant = () => {
    setIsVoiceListening(true);
    setVoiceQuery('');
    setVoiceResponse(null);
    const text = "当前批次还有多久可以采摘？";
    let current = "";
    let i = 0;
    const interval = setInterval(() => {
      current += text[i];
      setVoiceQuery(current);
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        setIsVoiceListening(false);
        setIsVoiceThinking(true);
        setTimeout(() => {
           setVoiceResponse("根据农事记录与品种生长周期推算，【春白芍A区】当前积温已达标，预计还有 12 天 即可进入最佳采摘期。建议下周开始准备分拣场地。");
           setIsVoiceThinking(false);
        }, 1500);
      }
    }, 80);
  };
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async (mode: 'scan' | 'photo' | 'ai') => {
    setCameraMode(mode);
    setShowCamera(true);
    setAiReport(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } else {
        throw new Error('getUserMedia not supported on this browser/environment');
      }
    } catch (err) {
      console.warn("Camera access denied or unavailable, falling back to simulation.", err);
      // We don't block the UI, we just show the simulation button without a live feed.
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const simulateAction = async () => {
    if (cameraMode === 'scan') {
      let nextScan = 'ORC-2026-' + Math.floor(Math.random() * 1000);
      try {
         const saved = localStorage.getItem('system_batches');
         if (saved) {
           const batches = JSON.parse(saved);
           if (batches && batches.length > 0) {
             const randomBatch = batches[Math.floor(Math.random() * batches.length)];
             nextScan = randomBatch.id;
           }
         }
      } catch (e) {}

      if (isOffline) {
        setOfflineScans(prev => [...prev, nextScan]);
        setCameraMode('photo'); // Return to main UI to see scans
        setShowCamera(false);
      } else {
        setScannedBatch(nextScan);
        setShowCamera(false);
        setMobileTab('trace');
        setShowTraceResult(true);
      }
    } else if (cameraMode === 'ai') {
      if (videoRef.current && canvasRef.current) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
           ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
           const base64Data = canvas.toDataURL('image/jpeg', 0.8);
           
           setIsAiAnalyzing(true);
           // Simulate AI analyzing
           setTimeout(() => {
              const mockResult = `该植物叶片显示出轻微的发黄，初步判断为缺氮或光照不足，建议增加适量氮肥并确保有充足的日照。`;
              setAiReport(mockResult);
              setRecordNotes(prev => prev + (prev ? '\n' : '') + `[AI识别结果]: ${mockResult}`);
              setIsAiAnalyzing(false);
              setTimeout(() => stopCamera(), 1000); // go back
           }, 1500);
        }
      }
    } else {
      setPhotoCaptured(true);
      stopCamera();
    }
  };
  
  const handleVoiceRecord = () => {
     if(isRecording || isParsing) return;
     
     const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
     if (!SpeechRecognition) {
       setShowStatusToast("当前环境暂不支持语音录入，请手动记录");
       setTimeout(() => setShowStatusToast(null), 3000);
       return;
     }

     const recognition = new SpeechRecognition();
     recognition.lang = 'zh-CN';
     recognition.interimResults = true;
     recognition.continuous = false;

     recognition.onstart = () => {
       setIsRecording(true);
       setRecordNotes('');
     };

     recognition.onresult = (event: any) => {
       const transcript = Array.from(event.results)
         .map((result: any) => result[0])
         .map((result: any) => result.transcript)
         .join('');
       setRecordNotes(transcript);
     };

     recognition.onerror = (event: any) => {
       console.error("Speech recognition error", event.error);
       setIsRecording(false);
       if (event.error !== 'no-speech') {
          setShowStatusToast("无法识别语音，请检查麦克风权限");
          setTimeout(() => setShowStatusToast(null), 3000);
       }
     };

     recognition.onend = () => {
       setIsRecording(false);
       setIsParsing(true);
       setTimeout(() => setIsParsing(false), 800); // Simulate AI parsing
     };

     try {
       recognition.start();
     } catch (e) {
       console.error("Error starting recognition", e);
       setIsRecording(false);
     }
  };

  const handleSyncOfflineScans = () => {
    setSyncProgress('syncing');
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      if (progress >= 100) {
        clearInterval(interval);
        setSyncProgress('success');
        setTimeout(() => {
          setOfflineScans([]);
          setSyncProgress('idle');
        }, 1500);
      }
    }, 200);
  };
  
  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleTemplateClick = (template: string) => {
    setRecordNotes(template);
  };

  useEffect(() => {
    if (!isOffline && offlineRecordData.length > 0) {
      setIsSyncing(true);
      setTimeout(() => {
        // Dispatch all cached offline notes to main system
        offlineRecordData.forEach(data => {
            let type = '其他作业';
            if (data.notes.includes('浇水') || data.notes.includes('滴灌')) type = '浇水';
            else if (data.notes.includes('肥')) type = '施肥';
            else if (data.notes.includes('病') || data.notes.includes('虫') || data.notes.includes('药')) type = '病虫害防治';
            else if (data.notes.includes('草')) type = '除草';

            window.dispatchEvent(new CustomEvent('farm-record-added', { 
               detail: { 
                 batchId: data.batchId, 
                 inputCost: data.inputCost,
                 laborCost: data.laborCost,
                 type,
                 desc: data.notes
               } 
            }));
        });
        setOfflineRecordData([]);
        setIsSyncing(false);
      }, 2000);
    }
  }, [isOffline, offlineRecordData]);

  const [showStatusToast, setShowStatusToast] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!recordNotes) return;
    
    // Attempt to guess type from notes
    let type = '其他作业';
    if (recordNotes.includes('浇水') || recordNotes.includes('滴灌')) type = '浇水';
    else if (recordNotes.includes('肥')) type = '施肥';
    else if (recordNotes.includes('病') || recordNotes.includes('虫') || recordNotes.includes('药')) type = '病虫害防治';
    else if (recordNotes.includes('草')) type = '除草';

    const numericInputCost = Number(inputCost) || 50;
    const numericLaborCost = Number(laborCost) || 1;

    if (isOffline) {
      setOfflineRecordData(prev => [...prev, { batchId: scannedBatch !== '...' ? scannedBatch : 'ORC-2026-000', notes: recordNotes, inputCost: numericInputCost, laborCost: numericLaborCost }]);
      setRecordNotes('');
      setInputCost('');
      setLaborCost('');
      setShowStatusToast('离线已缓存');
    } else {
      // Dispatch real event to sync with the main system
      if (scannedBatch && scannedBatch !== '...') {
        window.dispatchEvent(new CustomEvent('farm-record-added', { 
           detail: { 
             batchId: scannedBatch, 
             inputCost: numericInputCost,
             laborCost: numericLaborCost,
             type,
             desc: recordNotes
           } 
        }));
      }
      setRecordNotes('');
      setInputCost('');
      setLaborCost('');
      setPhotoCaptured(false);
      setShowStatusToast('数据已安全上链');
    }
    setTimeout(() => setShowStatusToast(null), 2000);
  };

  return (
    <div className="flex h-full items-center justify-center bg-gray-100/50 rounded-2xl">
      {/* Phone Frame */}
      <div className="w-[375px] h-[812px] bg-gray-900 rounded-[3rem] p-4 shadow-2xl relative flex flex-col ring-8 ring-gray-200">
        <div className="absolute top-0 inset-x-0 h-7 flex items-center justify-center z-20">
          <div className="w-32 h-6 bg-black rounded-b-3xl"></div>
        </div>
        
        {/* Phone Screen */}
        <div className="flex-1 bg-gradient-to-b from-gray-50 to-gray-100 rounded-[2rem] overflow-hidden flex flex-col relative mt-2">
          
          {!isAppAuthenticated ? (
            <div className="flex-1 w-full flex flex-col items-center justify-center p-6 pb-20 relative bg-white">
              <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-[2rem] shadow-xl flex items-center justify-center text-white mb-6">
                <Leaf className="w-10 h-10" />
              </div>
              
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">溯源工作台</h2>
              <p className="text-sm font-medium text-slate-500 mt-2 mb-10 text-center">数字生态农业移动管理端<br/>让每一次农事都被信任</p>

              <div className="w-full space-y-4">
                {isAppRegistering ? (
                  <>
                    <input type="text" placeholder="手机号码" className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
                    <input type="text" placeholder="商户邀请码 / 企业名称" className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
                    <div className="flex gap-2">
                      <input type="text" placeholder="验证码" className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
                      <button className="whitespace-nowrap px-4 py-3.5 bg-slate-100 text-slate-600 rounded-2xl text-xs font-bold hover:bg-slate-200 transition-colors">获取验证码</button>
                    </div>
                  </>
                ) : (
                  <>
                    <input type="text" placeholder="手机号码 / 一键登录" className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
                    <input type="password" placeholder="服务密码" className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
                  </>
                )}
                
                <button 
                  onClick={() => setIsAppAuthenticated(true)}
                  className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all mt-4"
                >
                  {isAppRegistering ? '注册并绑定' : '安全登录'}
                </button>
                
                <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-slate-100 w-full">
                  {!isAppRegistering && (
                    <button className="w-12 h-12 bg-[#07c160]/10 text-[#07c160] rounded-full flex items-center justify-center hover:bg-[#07c160]/20 transition-colors">
                      <MessageSquare className="w-6 h-6" />
                    </button>
                  )}
                </div>
              </div>
              
              <button 
                onClick={() => setIsAppRegistering(!isAppRegistering)}
                className="absolute bottom-10 text-emerald-600 text-sm font-bold active:bg-emerald-50 px-4 py-2 rounded-full transition-colors"
              >
                {isAppRegistering ? '已有账号? 返回登录' : '没有账号? 申请入驻'}
              </button>
            </div>
          ) : (
            <>
              {mobileTab === 'work' && (
                <div className="flex-1 w-full flex flex-col absolute inset-0 pb-20">
              {/* Header */}
              <div className={`bg-gradient-to-br from-${themeTheme}-600 to-${themeTheme}-800 px-6 pt-10 pb-6 text-white relative shrink-0 z-10 rounded-b-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.08)]`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-[22px] font-black mt-2 tracking-tight">芍药工作台</h2>
                    <p className={`text-${themeTheme}-100/90 text-xs mt-1.5 flex items-center gap-1 font-medium`}><MapPin className="w-3.5 h-3.5" /> 基地 A区 · 白芍种植组</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <button onClick={() => setThemeTheme(t => t === 'emerald' ? 'purple' : 'emerald')} className="mt-2 p-2 rounded-full bg-white/10 border border-white/20 text-white backdrop-blur-sm shadow-sm" title="切换主题">
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setIsOffline(!isOffline)}
                        className={`mt-2 p-2 rounded-full backdrop-blur-sm transition-colors border shadow-sm ${isOffline ? 'bg-amber-500/80 border-amber-400 text-white shadow-amber-500/20' : 'bg-white/10 border-white/20 text-white'}`}
                        title="模拟网络开关"
                      >
                        {isOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Sensors Grid */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col pt-3">
                    <div className={`text-${themeTheme}-200 text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider mb-1`}><Sun className="w-3 h-3" /> 光照度</div>
                    <div className="text-xl font-black font-mono">15,400<span className="text-[10px] font-medium ml-0.5 opacity-70">lx</span></div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col pt-3">
                    <div className={`text-${themeTheme}-200 text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider mb-1`}><Sun className="w-3 h-3" /> 环境温</div>
                    <div className="text-xl font-black font-mono">24.2<span className="text-[10px] font-medium ml-0.5 opacity-70">°C</span></div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col pt-3">
                    <div className={`text-${themeTheme}-200 text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider mb-1`}><Droplet className="w-3 h-3" /> 土壤湿</div>
                    <div className="text-xl font-black font-mono">58.5<span className="text-[10px] font-medium ml-0.5 opacity-70">%</span></div>
                  </div>
                </div>
                
                {/* Sync Status Bar */}
                <AnimatePresence>
                  {(isOffline || offlineRecordData.length > 0 || isSyncing) && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: 'auto' }} 
                      exit={{ opacity: 0, height: 0 }}
                      className={`absolute bottom-0 left-0 right-0 py-1.5 px-6 text-[10px] uppercase font-bold tracking-wider flex items-center justify-center gap-2 shadow-sm
                      ${isOffline ? 'bg-amber-500 text-amber-950' : 'bg-blue-500 text-white'}`}
                    >
                      {isOffline ? (
                        <>
                          <WifiOff className="w-3 h-3" />
                          <span>离线模式 (缓存: {offlineRecordData.length})</span>
                        </>
                      ) : isSyncing ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>正在同步区块数据...</span>
                        </>
                      ) : null}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-5 pb-28 space-y-6">
            
            {/* Task Board Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-end px-1">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  <CalendarCheck2 className="w-3.5 h-3.5" /> 待办作业看板
                </h3>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">本日 {todoTasks.filter(t => t.status === 'pending').length} 项待办</span>
              </div>
              
              <div className="space-y-3">
                {todoTasks.map(task => (
                  <div key={task.id} className={`bg-white/80 backdrop-blur-md rounded-2xl p-4 border transition-all ${task.status === 'completed' ? 'border-gray-50 opacity-60' : 'border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${
                          task.type === '施肥' ? 'bg-amber-100 text-amber-700' :
                          task.type === '浇水' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>{task.type}</span>
                        <span className="text-xs font-bold text-slate-700">{task.target}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-bold flex items-center gap-0.5"><Clock className="w-3 h-3" /> {task.time}</span>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mb-3">{task.desc}</p>
                    <div className="flex justify-end border-t border-gray-50 pt-3">
                      {task.status === 'completed' ? (
                        <div className="flex items-center gap-3 w-full justify-between">
                           <span className="text-xs font-bold text-emerald-500 flex items-center gap-1"><Check className="w-4 h-4" /> 已完成</span>
                           <button 
                             onClick={() => setShowReviewModal(task.id)}
                             className="flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg active:bg-slate-100 transition-colors"
                           >
                              <MessageSquare className="w-3.5 h-3.5" /> 互动评价与照片
                           </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleTaskCheckIn(task.id)}
                          disabled={checkingTask === task.id}
                          className="flex items-center gap-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-lg active:bg-indigo-100 transition-colors disabled:opacity-50"
                        >
                          {checkingTask === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                          一键扫码打卡记录
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Templates Section added */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
                快捷指令
              </h3>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 snap-x">
                <button 
                  onClick={() => {
                    setIsPatrolling(true);
                    setTimeout(() => {
                      const now = new Date();
                      const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                      setRecordNotes(`[一键巡检日志] ${timestamp}\n当前坐标：GPS(25.32°N, 100.18°E)\n巡检照片已通过时间戳水印并上链。\n当前温湿度正常，无明显病虫害痕迹。`);
                      setPhotoCaptured(true);
                      setIsPatrolling(false);
                    }, 1500);
                  }}
                  disabled={isPatrolling}
                  className="whitespace-nowrap snap-start flex items-center gap-1.5 px-4 py-2 bg-white text-blue-700 border border-slate-200 rounded-xl text-xs font-bold active:bg-blue-50 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isPatrolling ? <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" /> : <MapPin className="w-3.5 h-3.5 text-blue-500" />}
                  区块链定位
                </button>
                <button 
                  onClick={() => startCamera('ai')}
                  className="whitespace-nowrap snap-start flex justify-center items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-900 border border-purple-200/50 rounded-xl text-xs font-bold active:opacity-80 transition-colors shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" /> AI 诊断
                </button>
                {[
                  { title: '温室浇水', text: '完成A区常规温室喷洒浇水，控水控湿正常。', icon: Droplet },
                  { title: '施缓释肥', text: '追施芍药专用缓释肥，补充微量元素。', icon: Send },
                  { title: '病虫检测', text: '例行病害巡查看，检测是否有炭疽或介壳虫。', icon: Sun },
                  { title: '分株上盆', text: '芍药成熟带芽，进行分株移植上盆作业。', icon: CheckCircle2 }
                ].map((tpl, i) => (
                  <button 
                    key={i}
                    onClick={() => handleTemplateClick(tpl.text)}
                    className="whitespace-nowrap snap-start flex items-center gap-1.5 px-4 py-2 bg-white text-emerald-800 border border-slate-200 rounded-xl text-xs font-bold active:bg-slate-50 transition-colors shadow-sm"
                  >
                    <tpl.icon className="w-3.5 h-3.5 text-emerald-500" />
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">上报流程</h3>
              
              {/* Offline Cache Indicator */}
              {offlineScans.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-16 h-16 bg-amber-100 rounded-bl-full opacity-50 pointer-events-none" />
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-900 text-sm">离线扫码缓存池</h4>
                        <p className="text-[10px] text-amber-700 mt-0.5">待同步记录: <strong className="text-amber-600 font-bold">{offlineScans.length}</strong> 条</p>
                      </div>
                    </div>
                    {!isOffline && (
                      <div className="flex flex-col items-end gap-1">
                        {syncProgress === 'idle' && (
                          <button 
                            onClick={handleSyncOfflineScans}
                            className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            联网同步
                          </button>
                        )}
                        {syncProgress === 'syncing' && (
                          <div className="flex items-center gap-1.5 text-amber-600 text-xs font-bold bg-amber-100 px-3 py-1.5 rounded-xl">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            同步中...
                          </div>
                        )}
                        {syncProgress === 'success' && (
                          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-100 px-3 py-1.5 rounded-xl">
                            <CheckCircle2 className="w-4 h-4" />
                            同步完成
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {syncProgress === 'syncing' && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-amber-200 overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all duration-1000 ease-out" style={{width: '100%'}}></div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white/80 backdrop-blur-md rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">扫描批次码 (自动获取)</label>
                <div 
                  onClick={() => startCamera('scan')}
                  className="bg-gray-50 px-4 h-[44px] rounded-xl border border-gray-200 font-mono text-sm font-bold text-gray-700 flex justify-between items-center cursor-pointer hover:bg-emerald-50 transition-colors"
                >
                  {scannedBatch} 
                  {scannedBatch !== '...' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <ScanLine className="w-5 h-5 text-emerald-600" />}
                </div>
              </div>

              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">物料成本 (元)</label>
                <input 
                  type="number" 
                  inputMode="decimal"
                  pattern="[0-9]*"
                  name="cost"
                  autoComplete="transaction-amount"
                  value={inputCost}
                  onChange={(e) => setInputCost(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 h-[44px] text-sm focus:outline-none focus:border-emerald-500 font-medium active:scale-[0.99] transition-transform" 
                  placeholder="0.00"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">耗用工时 (天)</label>
                <input 
                  type="number" 
                  inputMode="decimal"
                  pattern="[0-9]*"
                  name="labor"
                  autoComplete="off"
                  value={laborCost}
                  onChange={(e) => setLaborCost(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 h-[44px] text-sm focus:outline-none focus:border-emerald-500 font-medium active:scale-[0.99] transition-transform" 
                  placeholder="0.5"
                />
              </div>
              
              <div className="col-span-2">
                <div className="flex justify-between items-end mb-1.5">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">农事实录</label>
                  <button 
                    onClick={handleVoiceRecord}
                    disabled={isRecording || isParsing}
                    className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-colors ${
                      isRecording ? 'bg-red-50 text-red-600' : 
                      isParsing ? 'bg-purple-50 text-purple-600 animate-pulse' : 
                      'bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    {isRecording ? (
                      <div className="flex items-end gap-0.5 h-3">
                        <div className="w-1 bg-red-400 animate-[bounce_1s_infinite] h-full"></div>
                        <div className="w-1 bg-red-400 animate-[bounce_1s_infinite_0.1s] h-2"></div>
                        <div className="w-1 bg-red-400 animate-[bounce_1s_infinite_0.2s] h-3"></div>
                        <div className="w-1 bg-red-400 animate-[bounce_1s_infinite_0.3s] h-1.5"></div>
                      </div>
                    ) : isParsing ? '正在智能分类中...' : '语音录入'}
                  </button>
                </div>
                <textarea 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 font-medium transition-colors" 
                  rows={2} 
                  name="notes"
                  autoComplete="on"
                  placeholder="请输入或语音直录操作明细..."
                  value={recordNotes}
                  onChange={(e) => setRecordNotes(e.target.value)}
                />
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {['浇水', '施肥', '除草', '病虫防治'].map(tag => (
                    <button 
                      key={tag}
                      onClick={() => setRecordNotes(prev => prev ? `${prev}，${tag}` : tag)}
                      className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium active:scale-95 transition-transform"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">现场图片证明</label>
                <button 
                  onClick={() => startCamera('photo')}
                  className="w-full h-[60px] border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                >
                  {photoCaptured ? (
                    <div className="flex flex-row items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span className="text-xs text-emerald-600 font-medium">已拍摄 (重拍)</span>
                    </div>
                  ) : (
                    <div className="flex flex-row items-center gap-2">
                      <Camera className="w-5 h-5" />
                      <span className="text-xs">点击拍摄现状</span>
                    </div>
                  )}
                </button>
              </div>

              <div className="col-span-2">
                <button 
                  onClick={handleSubmit}
                  className={`w-full text-white font-bold py-3.5 rounded-xl mt-1 shadow-md transition-all 
                    ${isOffline ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : `bg-gradient-to-r from-${themeTheme}-500 to-${themeTheme}-600 hover:from-${themeTheme}-600 hover:to-${themeTheme}-700 shadow-${themeTheme}-200`} active:scale-[0.98]`}
                >
                  {isOffline ? '离线保存 (待同步)' : '提交上报并上链'}
                </button>
                <p className="text-[10px] text-center text-gray-400 font-medium pt-3 pb-1">数据将不可篡改以保证溯源真实性</p>
              </div>
            </div>
            </div>
            
            {showStatusToast && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl z-50 whitespace-nowrap"
              >
                {showStatusToast}
              </motion.div>
            )}
          </div>
          </div>
          )}

          <AnimatePresence>
            {mobileTab === 'trace' && showTraceResult && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute inset-0 z-30 bg-gray-50 flex flex-col pb-20"
              >
                <div className={`bg-gradient-to-br from-${themeTheme}-600 to-${themeTheme}-800 p-6 pt-12 pb-16 text-white relative shrink-0`}>
                   <div className={`absolute top-4 right-4 text-${themeTheme}-300 font-mono text-[10px]`}>{scannedBatch}</div>
                   <motion.div 
                     initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
                     className={`w-16 h-16 bg-white shrink-0 rounded-full flex items-center justify-center text-${themeTheme}-600 mb-4 shadow-xl`}
                   >
                      <CheckCircle2 className="w-8 h-8" />
                   </motion.div>
                   <motion.h2 
                     initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
                     className="text-2xl font-black mb-1"
                   >溯源验证成功</motion.h2>
                   <motion.p 
                     initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
                     className={`text-${themeTheme}-100 text-sm`}
                   >该商品为官方认证正品极品芍药</motion.p>
                </div>
                
                <div className="flex-1 bg-gray-50 relative -mt-6 rounded-t-3xl pt-8 px-6 overflow-y-auto pb-10">
                   <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 bg-gray-200 rounded-full"></div>
                   
                   <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="space-y-6">
                     <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
                        <img src="https://images.unsplash.com/photo-1595166669963-c744f9c5d0ba?auto=format&fit=crop&w=150&q=80" className="w-20 h-20 rounded-xl object-cover shadow-sm bg-gray-100" />
                        <div>
                           <div className={`text-xs font-bold text-${themeTheme}-600 mb-1 bg-${themeTheme}-50 inline-block px-2 py-0.5 rounded`}>大雪素</div>
                           <h3 className="font-bold text-gray-800 text-lg">高山有机春白芍</h3>
                           <p className="text-xs text-gray-500 mt-1">产地: 云南大理 A区</p>
                        </div>
                     </div>
                     
                     <div>
                        <h4 className="font-bold text-sm text-gray-800 mb-3 ml-1">区块链存证数据</h4>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                           <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                              <span className="text-xs text-gray-500">上链哈希 (TXID)</span>
                              <span className="font-mono text-[10px] font-bold text-gray-700 break-all w-3/4 text-right">0x8F92A2C...83B1C</span>
                           </div>
                           <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                              <span className="text-xs text-gray-500">装运出圃质检</span>
                              <span className="text-xs font-bold text-gray-700 flex items-center gap-1"><CheckCircle2 className={`w-3 h-3 text-${themeTheme}-500`} /> 质检员: 王建</span>
                           </div>
                           <div className="flex justify-between items-center pb-1">
                              <span className="text-xs text-gray-500">封箱时间</span>
                              <span className="text-xs font-bold text-gray-700">2026.06.08 14:30</span>
                           </div>
                        </div>
                     </div>
                     
                     <button 
                        onClick={handleGeneratePoster}
                        className={`w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all mt-4
                        ${isGeneratingPoster ? 'bg-gray-400' : `bg-gradient-to-r from-${themeTheme}-500 to-${themeTheme}-600 shadow-md shadow-${themeTheme}-200`} active:scale-[0.98]`}
                        disabled={isGeneratingPoster}
                     >
                        {isGeneratingPoster ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                        {isGeneratingPoster ? '正在绘制精美海报...' : '生成溯源海报 (Canvas)'}
                     </button>
                   </motion.div>
                </div>
                
                {/* Poster Canvas Modal */}
                <AnimatePresence>
                  {showPoster && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6"
                    >
                      <button onClick={() => setShowPoster(false)} className="absolute top-6 right-6 text-white/50 hover:text-white p-2">
                        <X className="w-6 h-6" />
                      </button>
                      <h3 className="text-white font-bold mb-4 tracking-widest text-sm text-center">长按海报保存至相册<br/><span className="text-[10px] text-gray-400 font-normal">方便在社交媒体传播与防伪验证</span></h3>
                      
                      <motion.div 
                        initial={{ y: 20, scale: 0.9 }}
                        animate={{ y: 0, scale: 1 }}
                        className="bg-white rounded-lg p-2 shadow-2xl relative"
                      >
                        {/* The actual canvas where the poster is drawn */}
                        <canvas ref={posterCanvasRef} width={400} height={500} className="w-full max-w-[320px] h-auto rounded border border-gray-100"></canvas>
                        
                        <button className={`absolute -bottom-5 left-1/2 -translate-x-1/2 bg-${themeTheme}-600 text-white px-6 py-2.5 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 whitespace-nowrap z-10`} onClick={() => {
                          const canvas = posterCanvasRef.current;
                          if (canvas) {
                            const link = document.createElement('a');
                            link.download = '溯源档案海报.png';
                            link.href = canvas.toDataURL();
                            link.click();
                          }
                        }}>
                           <Download className="w-4 h-4" /> 网页保存接口
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {mobileTab === 'me' && (
              <motion.div 
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="absolute inset-0 z-30 bg-gray-50 flex flex-col p-6 pt-12 items-center text-center pb-20 overflow-y-auto"
              >
                 <div className="w-full flex items-center justify-between mb-8">
                    <h2 className="text-xl font-black text-gray-800 tracking-tight">个人中心</h2>
                    <button className="p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-gray-600"><SettingsIcon className="w-5 h-5" /></button>
                 </div>
                 
                 <div className="w-full bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col items-center relative overflow-hidden">
                    <div className={`absolute top-0 inset-x-0 h-16 bg-gradient-to-br from-${themeTheme}-500/20 to-transparent`}></div>
                    <div className={`w-20 h-20 rounded-full bg-${themeTheme}-100 flex items-center justify-center text-${themeTheme}-600 mb-3 shadow-[0_0_0_4px_white] z-10 overflow-hidden`}>
                       <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 z-10 flex items-center gap-1.5 justify-center">李建国 <CheckCircle2 className={`w-4 h-4 text-${themeTheme}-500`} /></h3>
                    <p className="text-gray-500 text-xs mt-1 z-10">农技员 · ID: AGRI-0881</p>
                    
                    <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 mt-6 flex justify-around relative z-10">
                      <div>
                        <div className={`text-xl font-black text-${themeTheme}-600`}>142</div>
                        <div className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">本月记录</div>
                      </div>
                      <div className="w-px bg-gray-200"></div>
                      <div>
                        <div className={`text-xl font-black text-${themeTheme}-600`}>98%</div>
                        <div className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">合规率</div>
                      </div>
                      <div className="w-px bg-gray-200"></div>
                      <div>
                        <div className={`text-xl font-black text-${themeTheme}-600`}>A</div>
                        <div className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">绩效等第</div>
                      </div>
                    </div>
                 </div>

                 <div className="w-full mt-6 space-y-3">
                   <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                     <button className="w-full flex items-center justify-between p-4 bg-white active:bg-gray-50 transition-colors border-b border-gray-50">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center"><DeviceIcon className="w-4 h-4" /></div>
                           <span className="text-sm font-bold text-gray-700">蓝牙传感设备配置</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                     </button>
                     <button className="w-full flex items-center justify-between p-4 bg-white active:bg-gray-50 transition-colors border-b border-gray-50">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center"><MapPin className="w-4 h-4" /></div>
                           <span className="text-sm font-bold text-gray-700">承包地块管理</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                     </button>
                     <button className="w-full flex items-center justify-between p-4 bg-white active:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"><WalletCards className="w-4 h-4" /></div>
                           <span className="text-sm font-bold text-gray-700">产量激励与分红</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">New</span>
                           <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                     </button>
                   </div>

                   <button className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm active:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center"><HelpCircle className="w-4 h-4" /></div>
                         <span className="text-sm font-bold text-gray-700">系统帮助与客服</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                   </button>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Tabs */}
          <div className="absolute bottom-0 inset-x-0 h-20 bg-white border-t border-gray-100 z-[45] px-8 flex justify-between items-center rounded-b-[2rem] shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
             <button onClick={() => setMobileTab('work')} className={`relative flex flex-col items-center gap-1 w-16 h-full justify-center transition-colors ${mobileTab === 'work' ? `text-${themeTheme}-600` : 'text-gray-400'} active:scale-95`}>
                <FileText className={`w-6 h-6 transition-transform ${mobileTab === 'work' ? 'scale-110' : ''}`} />
                <span className="text-[10px] font-bold">工作台</span>
                {mobileTab === 'work' && <motion.div layoutId="tab-indicator" className={`absolute top-0 w-12 h-1 rounded-b-full bg-${themeTheme}-500`} />}
             </button>
             <button onClick={() => { setMobileTab('trace'); setShowTraceResult(true); }} className={`relative flex flex-col items-center gap-1 w-16 h-full justify-center transition-colors ${mobileTab === 'trace' ? `text-${themeTheme}-600` : 'text-gray-400'} active:scale-95`}>
                <div className="relative">
                  <div className={`absolute -inset-2 bg-${themeTheme}-50 rounded-full -z-10 transition-transform ${mobileTab === 'trace' ? 'scale-100' : 'scale-0'}`}></div>
                  <QrCode className="w-6 h-6 z-10 relative" />
                </div>
                <span className="text-[10px] font-bold">近期溯源</span>
                {mobileTab === 'trace' && <motion.div layoutId="tab-indicator" className={`absolute top-0 w-12 h-1 rounded-b-full bg-${themeTheme}-500`} />}
             </button>
             <button onClick={() => setMobileTab('me')} className={`relative flex flex-col items-center gap-1 w-16 h-full justify-center transition-colors ${mobileTab === 'me' ? `text-${themeTheme}-600` : 'text-gray-400'} active:scale-95`}>
                <User className={`w-6 h-6 transition-transform ${mobileTab === 'me' ? 'scale-110' : ''}`} />
                <span className="text-[10px] font-bold">我的</span>
                {mobileTab === 'me' && <motion.div layoutId="tab-indicator" className={`absolute top-0 w-12 h-1 rounded-b-full bg-${themeTheme}-500`} />}
             </button>
          </div>

          {/* Floating Voice Assistant Orb */}
          {!showCamera && !showVoiceAssistant && (
             <button 
               onClick={() => {
                 setShowVoiceAssistant(true);
                 simulateVoiceAssistant();
               }}
               className="absolute bottom-24 right-6 w-14 h-14 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-full shadow-[0_8px_30px_rgb(99,102,241,0.4)] flex items-center justify-center text-white z-[46] active:scale-95 transition-transform"
             >
               <div className="absolute inset-0 rounded-full border border-white/40 animate-ping"></div>
               <Mic className="w-6 h-6" />
             </button>
          )}

          {/* Voice Assistant Overlay */}
          {showVoiceAssistant && (
             <div className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center">
                <button 
                  onClick={() => setShowVoiceAssistant(false)} 
                  className="absolute top-10 right-6 text-gray-400 p-2 bg-gray-100 rounded-full"
                >
                   <X className="w-5 h-5" />
                </button>
                
                <div className="flex-1 flex flex-col items-center justify-center w-full px-8">
                  <div className="relative mb-10 w-24 h-24">
                     <div className={`absolute inset-0 bg-indigo-500 rounded-full opacity-20 ${isVoiceListening ? 'animate-ping' : ''}`}></div>
                     <div className={`absolute inset-2 bg-indigo-500 rounded-full opacity-40 ${isVoiceThinking ? 'animate-pulse' : ''}`}></div>
                     <div className="absolute inset-4 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl">
                        <Mic className="w-8 h-8" />
                     </div>
                  </div>

                  <div className="min-h-[100px] w-full text-center">
                    {isVoiceListening ? (
                       <p className="text-xl font-bold text-gray-800 tracking-tight">{voiceQuery || "正在聆听..."}</p>
                    ) : isVoiceThinking ? (
                       <div className="flex flex-col items-center gap-3">
                         <p className="text-xl font-bold text-gray-800 tracking-tight">{voiceQuery}</p>
                         <div className="flex items-center gap-2 text-indigo-500 text-sm font-medium bg-indigo-50 px-4 py-2 rounded-full">
                           <Loader2 className="w-4 h-4 animate-spin" /> Gemini AI 分析中
                         </div>
                       </div>
                    ) : (
                       <div className="flex flex-col items-center gap-6 w-full">
                         <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl w-full text-right shadow-sm">
                           <p className="text-gray-800 font-medium">{voiceQuery}</p>
                         </div>
                         <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-3xl rounded-tl-sm w-full text-left shadow-sm">
                           <div className="flex items-center gap-2 text-indigo-700 font-bold mb-2 text-xs">
                             <Sparkles className="w-3.5 h-3.5" /> 智能解答
                           </div>
                           <p className="text-gray-800 text-sm leading-relaxed">{voiceResponse}</p>
                         </div>
                         <button 
                           onClick={simulateVoiceAssistant}
                           className="px-6 py-3 bg-indigo-600 active:bg-indigo-700 text-white font-bold rounded-full mt-4 flex items-center gap-2 shadow-lg"
                         >
                           <Mic className="w-4 h-4" /> 再次提问
                         </button>
                       </div>
                    )}
                  </div>
                </div>
             </div>
          )}

          {/* Camera Overlay */}
          {showCamera && (
            <div className="absolute inset-0 bg-black z-50 flex flex-col pt-10">
              <div className="px-6 py-4 flex justify-between items-center text-white shrink-0">
                <span className="font-bold">
                  {cameraMode === 'scan' ? '扫描芍药防伪溯源标签' : cameraMode === 'ai' ? 'AI 植保病害识别' : '拍摄长势/质检照片'}
                </span>
                <button onClick={stopCamera} className="bg-white/20 p-2 rounded-full backdrop-blur">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 relative bg-gray-900 mx-4 mb-8 rounded-3xl overflow-hidden flex flex-col items-center justify-center border border-gray-800">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Guidelines */}
                <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
                  {cameraMode === 'scan' ? (
                     <div className="w-full aspect-square border-2 border-emerald-500 rounded-3xl relative">
                        <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500 shadow-[0_0_8px_#10b981] animate-[scan_2s_ease-in-out_infinite]" />
                     </div>
                  ) : cameraMode === 'ai' ? (
                     <div className="w-full aspect-square border border-purple-500/50 rounded-3xl relative flex flex-col items-center justify-center bg-purple-500/10">
                        <ScanLine className="w-8 h-8 text-purple-400 mb-2 opacity-50" />
                        <span className="text-purple-200/70 text-xs">对准病害部位拍照</span>
                        {isAiAnalyzing && (
                          <div className="absolute inset-0 bg-black/60 rounded-3xl flex flex-col items-center justify-center backdrop-blur-sm">
                            <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-2" />
                            <span className="text-white text-xs font-medium">Gemini 视觉大模型分析中...</span>
                          </div>
                        )}
                     </div>
                  ) : (
                     <div className="w-full aspect-video border border-white/40 rounded-xl relative flex items-center justify-center">
                        <span className="text-white/40 text-xs">将作物置于框内</span>
                     </div>
                  )}
                </div>

                {/* AI Report Result Container */}
                {aiReport && cameraMode === 'ai' && (
                  <div className="absolute bottom-28 inset-x-4 bg-black/80 backdrop-blur text-white p-4 rounded-2xl border border-purple-500/30 shadow-2xl z-20 max-h-48 overflow-y-auto">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold flex items-center gap-1.5 text-purple-300">
                        <Sparkles className="w-4 h-4" /> AI 诊断结果
                      </h4>
                      <button onClick={() => setAiReport(null)} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{aiReport}</div>
                  </div>
                )}

                {/* Shutter Button area underneath */}
                <div className="absolute bottom-8 inset-x-0 flex justify-center pb-safe z-10">
                   <button 
                     disabled={isAiAnalyzing}
                     onClick={simulateAction}
                     className="w-16 h-16 rounded-full border-4 border-white/30 p-1 active:scale-95 transition-transform disabled:opacity-50"
                   >
                      <div className={`w-full h-full rounded-full relative flex items-center justify-center shadow-lg ${cameraMode === 'ai' ? 'bg-purple-500' : 'bg-white'}`}>
                        {cameraMode === 'scan' ? <ScanLine className="w-6 h-6 text-gray-900" /> : cameraMode === 'ai' ? <Sparkles className="w-6 h-6 text-white" /> : <Camera className="w-6 h-6 text-gray-900" />}
                      </div>
                   </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Review Modal */}
          {showReviewModal && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-end">
              <div className="bg-white w-full h-[85%] rounded-t-3xl pt-2 px-4 pb-8 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 relative">
                 <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
                 <div className="flex justify-between items-center mb-6">
                    <div>
                       <h3 className="font-black text-lg text-slate-800">作业互动评价</h3>
                       <p className="text-xs font-medium text-slate-500 mt-1">上传实地照片或回复农技师指导意见</p>
                    </div>
                    <button onClick={() => setShowReviewModal(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                       <X className="w-4 h-4" />
                    </button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto w-[calc(100%+2rem)] -mx-4 px-4 bg-slate-50/50 space-y-4 py-2">
                    {/* Mock Chat / Logs */}
                    <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                       <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded">总台农技师 - 李建国</span>
                          <span className="text-[10px] text-slate-400">14:20 PM</span>
                       </div>
                       <p className="text-xs text-slate-600 font-medium">看数据A区湿度有点低，缓释肥追施的时候注意多带50%的水，拍张土表的照片我看下。</p>
                    </div>
                    
                    <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 shadow-sm ml-6">
                       <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] text-emerald-700 font-bold px-2 py-0.5 rounded flex items-center gap-1"><Check className="w-3 h-3" /> 我 (现场操作员)</span>
                          <span className="text-[10px] text-emerald-600/50">14:45 PM</span>
                       </div>
                       <p className="text-xs text-emerald-800 font-medium mb-3">好的李工，已经按照要求加水了。这是施肥后的实拍图。</p>
                       <div className="relative rounded-lg overflow-hidden border border-emerald-200">
                          <img src="https://images.unsplash.com/photo-1592424005085-f5b248a31ae5?auto=format&fit=crop&w=400&q=80" alt="Field" className="w-full h-32 object-cover" />
                          <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm text-white text-[8px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1">
                             <MapPin className="w-2 h-2" />
                             GPS: 25.58°N, 100.22°E
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="pt-4 mt-auto">
                    <button className="w-full py-3.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors shadow-sm mb-3">
                       <Camera className="w-5 h-5" />
                       拍摄带坐标水印的回复照片
                    </button>
                    <div className="flex items-center gap-2">
                       <input type="text" placeholder="文字回复农技师..." className="flex-1 px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                       <button className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold pb-0.5 shadow-sm active:scale-95 transition-transform"><Send className="w-4 h-4 ml-0.5" /></button>
                    </div>
                 </div>
              </div>
            </div>
          )}

            </>
          )}

        </div>
      </div>
    </div>
  );
}
