import { useState, useEffect } from 'react';
import { Map, MapPin, Search, Plus, Navigation, Layers, CheckCircle2, ChevronRight, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_FIELDS = [
  { id: 'F001', name: '高山温室 A区', area: 15.5, crop: '大雪素', status: 'active', humidity: '65%', temp: '22°C', manager: '李建国', health: 85 },
  { id: 'F002', name: '露天培育 B区', area: 42.0, crop: '春白芍', status: 'preparing', humidity: '45%', temp: '18°C', manager: '王建', health: 92 },
  { id: 'F003', name: '高寒留种 C区', area: 8.2, crop: '雪山红', status: 'active', humidity: '55%', temp: '15°C', manager: '张晓明', health: 78 },
  { id: 'F004', name: '休耕轮作 D区', area: 20.0, crop: '-', status: 'resting', humidity: '-', temp: '-', manager: '-', health: 100 },
];

export default function FarmFields() {
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [activeField, setActiveField] = useState(INITIAL_FIELDS[0]);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingMap, setIsEditingMap] = useState(false);

  useEffect(() => {
    const handleRecordSync = (e: any) => {
       // Randomly apply health calculation to active field to simulate real-time ML processing
       const timeDiff = Math.floor(Math.random() * 5) + 2; 
       setFields(prev => prev.map(f => {
          if (f.status === 'active' || f.status === 'preparing') {
             return { ...f, health: Math.min(100, f.health + timeDiff) };
          }
          return f;
       }));
       // If active field was updated
       setActiveField(prev => ({ ...prev, health: Math.min(100, prev.health + timeDiff) }));
    };
    window.addEventListener('farm-record-added', handleRecordSync);
    return () => window.removeEventListener('farm-record-added', handleRecordSync);
  }, []);

  const filteredFields = fields.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.crop.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFieldStatus = () => {
     setFields(prev => prev.map(f => {
        if (f.id === activeField.id) {
            const nextStatus = f.status === 'active' ? 'resting' : 'active';
            const updated = { ...f, status: nextStatus, crop: nextStatus === 'resting' ? '-' : f.crop };
            setActiveField(updated);
            return updated;
        }
        return f;
     }));
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Map className="w-6 h-6 text-emerald-600" />
            数字地块管理
          </h2>
          <p className="text-sm text-slate-500 mt-1">管理种植基地边界、传感器网络及实时环境数据</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 flex items-center rounded-lg max-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
            <input 
              type="text" 
              placeholder="搜索地块..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm px-2 w-full text-slate-700" 
            />
          </div>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> 绘制新地块
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left List */}
        <div className="w-80 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm">地块列表 ({filteredFields.length})</h3>
            <div className="flex bg-white rounded border border-slate-200 p-0.5">
               <button onClick={() => setViewMode('map')} className={`p-1 rounded ${viewMode === 'map' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}><MapPin className="w-3.5 h-3.5" /></button>
               <button onClick={() => setViewMode('list')} className={`p-1 rounded ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}><Layers className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredFields.map(field => (
              <button 
                key={field.id}
                onClick={() => setActiveField(field)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${activeField.id === field.id ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50 border-slate-100'}`}
              >
                 <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-sm text-slate-800">{field.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider
                      ${field.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                        field.status === 'preparing' ? 'bg-amber-100 text-amber-700' : 
                        'bg-slate-100 text-slate-600'
                      }
                    `}>
                      {field.status === 'active' ? '种植中' : field.status === 'preparing' ? '整地中' : '休耕'}
                    </span>
                 </div>
                 <div className="text-xs text-slate-500 flex items-center gap-2 mt-2">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{field.area} 亩</span>
                    <span>•</span>
                    <span>{field.crop}</span>
                 </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Map/Detail Area */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative flex flex-col">
          {viewMode === 'map' ? (
            <div className="flex-1 relative bg-slate-100">
               <div className="absolute inset-0 pattern-boxes pattern-slate-300 pattern-bg-transparent pattern-size-6 opacity-30"></div>
               {/* Mock Map View */}
               <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="w-full max-w-3xl aspect-video bg-emerald-900/5 rounded-3xl border-2 border-emerald-500/20 relative shadow-inner overflow-hidden backdrop-blur-sm">
                     {/* SVG Map Mock */}
                     <svg width="100%" height="100%" viewBox="0 0 800 450" className="opacity-80">
                        {/* A 区 */}
                        <polygon points="100,100 300,80 350,200 150,250" fill={activeField.id === 'F001' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.15)'} stroke="#10b981" strokeWidth="2" className="transition-all duration-300 cursor-pointer" onClick={() => setActiveField(fields[0])} />
                        {activeField.id === 'F001' && <circle cx="225" cy="165" r="4" fill="white" className="animate-pulse" />}
                        
                        {/* B 区 */}
                        <polygon points="320,70 600,100 550,280 370,210" fill={activeField.id === 'F002' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.15)'} stroke="#f59e0b" strokeWidth="2" className="transition-all duration-300 cursor-pointer" onClick={() => setActiveField(fields[1])} />
                        
                        {/* C 区 */}
                        <polygon points="120,270 330,230 380,380 200,400" fill={activeField.id === 'F003' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.15)'} stroke="#10b981" strokeWidth="2" className="transition-all duration-300 cursor-pointer" onClick={() => setActiveField(fields[2])} />
                        
                        {/* D 区 */}
                        <polygon points="390,225 540,295 480,420 360,390" fill={activeField.id === 'F004' ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.15)'} stroke="#94a3b8" strokeWidth="2" className="transition-all duration-300 cursor-pointer" onClick={() => setActiveField(fields[3])} />
                     </svg>

                     {/* Overlay Stats for Active Field */}
                     <AnimatePresence mode="wait">
                       <motion.div 
                         key={activeField.id}
                         initial={{ opacity: 0, x: 20 }}
                         animate={{ opacity: 1, x: 0 }}
                         exit={{ opacity: 0, x: -20 }}
                         className="absolute top-6 right-6 w-64 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-slate-200 p-4"
                       >
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-black text-slate-800">{activeField.name}</h4>
                            <div className="p-1.5 bg-slate-100 rounded-md">
                              <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 mb-4">
                             <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                               <div className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase tracking-wide">当前气温</div>
                               <div className="text-sm font-bold text-slate-700">{activeField.temp}</div>
                             </div>
                             <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                               <div className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase tracking-wide">土壤湿度</div>
                               <div className="text-sm font-bold text-slate-700">{activeField.humidity}</div>
                             </div>
                          </div>
                          
                                                     <ul className="space-y-1.5 border-t border-slate-100 pt-3">
                              <li className="flex justify-between text-xs items-center mb-1">
                                <span className="text-slate-500">综合健康指数</span>
                                <div className="flex items-center gap-1 font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                  <span>{activeField.health || 100}</span>
                                  <span className="text-[10px] text-emerald-500/80">NDVI</span>
                                </div>
                              </li>
                              <li className="flex justify-between text-xs">
                                <span className="text-slate-500">负责人</span>
                                <span className="font-bold text-slate-700">{activeField.manager}</span>
                              </li>
                              <li className="flex justify-between text-xs">
                                <span className="text-slate-500">规划面积</span>
                                <span className="font-mono text-slate-700">{activeField.area} 亩</span>
                              </li>
                              <li className="flex justify-between text-xs">
                                <span className="text-slate-500">种植品种</span>
                                <span className="font-bold text-slate-700">{activeField.crop}</span>
                              </li>
                           </ul>
                           
                           <div className="flex gap-2 mt-4">
                              <button className="flex-1 text-xs font-bold bg-emerald-50 text-emerald-600 py-2 rounded-lg hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1">
                                查看 IoT 详情 <ChevronRight className="w-3 h-3" />
                              </button>
                              <button onClick={toggleFieldStatus} className="flex-1 text-[10px] font-bold bg-slate-100 text-slate-600 py-2 rounded-lg hover:bg-slate-200 transition-colors">
                                {activeField.status === 'active' ? '标记休耕' : '恢复激活'}
                              </button>
                           </div>
                        </motion.div>
                      </AnimatePresence>
                   </div>
                </div>
                
             </div>
           ) : (
             <div className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start gap-6">
                     <div className="w-32 h-32 bg-slate-100 rounded-xl flex items-center justify-center border-2 border-slate-200 shrink-0 overflow-hidden relative">
                       <div className="absolute inset-0 bg-emerald-500/10 z-10" />
                       <MapPin className="w-8 h-8 text-emerald-600 opacity-50 absolute" />
                     </div>
                     <div className="flex-1">
                       <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-2xl font-black text-slate-800">{activeField.name}</h3>
                          <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded font-bold">{activeField.status === 'active' ? '正常运行' : activeField.status}</span>
                       </div>
                       <p className="text-sm text-slate-500 mb-4 bg-slate-50 inline-block px-3 py-1.5 rounded-lg border border-slate-100">标识码: {activeField.id} • 负责人: {activeField.manager} • 面积: {activeField.area} 亩</p>
                       <div className="flex gap-3">
                          <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700">编辑信息</button>
                       </div>
                     </div>
                  </div>
                </div>
             </div>
           )}
         </div>
       </div>
     </div>
   );
}
