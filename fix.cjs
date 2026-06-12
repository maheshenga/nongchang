const fs = require('fs');
let content = fs.readFileSync('src/components/FarmFields.tsx', 'utf8');
const index = content.indexOf('<ul className="space-y-1.5 border-t border-slate-100 pt-3">');
if (index !== -1) {
    content = content.substring(0, index) + `                           <ul className="space-y-1.5 border-t border-slate-100 pt-3">
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
`;
    fs.writeFileSync('src/components/FarmFields.tsx', content);
}
