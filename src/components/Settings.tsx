import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Bell, Shield, Key, MapPin, Database, ChevronRight, User, KeyRound, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'system'>('profile');
  
  // State management
  const [profile, setProfile] = useState({
    name: '李管理员',
    phone: '138****8888',
    orgName: '云南高山有机特供芍药合作社',
    address: '云南省大理白族自治州'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('agri_settings_profile');
    if (saved) {
      try { setProfile(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      localStorage.setItem('agri_settings_profile', JSON.stringify(profile));
      setIsSaving(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 800);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full font-bold text-sm shadow-xl z-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> 设置已成功保存并应用
          </motion.div>
        )}
      </AnimatePresence>
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-2 rounded-xl shadow-sm">
             <SettingsIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">系统设置</h2>
            <p className="text-xs text-slate-500 mt-0.5">管理系统参数、账户安全与通知偏好</p>
          </div>
        </div>
        <button 
           onClick={handleSave}
           disabled={isSaving}
           className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
        >
           {isSaving ? '保存中...' : <><Save className="w-4 h-4" /> 保存配置</>}
        </button>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Settings Sidebar */}
        <div className="w-64 border-r border-slate-100 bg-slate-50/30 p-4 space-y-1">
           <button 
             onClick={() => setActiveTab('profile')}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}
           >
             <User className="w-4 h-4" /> 账号资料
           </button>
           <button 
             onClick={() => setActiveTab('security')}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'security' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}
           >
             <Shield className="w-4 h-4" /> 安全设置
           </button>
           <button 
             onClick={() => setActiveTab('notifications')}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notifications' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}
           >
             <Bell className="w-4 h-4" /> 消息通知
           </button>
           <button 
             onClick={() => setActiveTab('system')}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'system' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}
           >
             <Database className="w-4 h-4" /> 系统参数
           </button>
        </div>
        
        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto p-8">
           {activeTab === 'profile' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
                 <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">账号基本资料</h3>
                 
                 <div className="space-y-6">
                    <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
                       <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin" className="w-20 h-20 bg-slate-100 rounded-full border-2 border-slate-200 shadow-sm" />
                       <div>
                          <button className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">更换头像</button>
                          <p className="text-xs text-slate-500 mt-2">支持 JPG、PNG 格式，文件小于 2MB</p>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                       <div>
                         <label className="block text-sm font-bold text-slate-700 mb-1.5">联系人员姓名</label>
                         <input 
                           type="text" 
                           value={profile.name} 
                           onChange={e => setProfile({...profile, name: e.target.value})}
                           className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" 
                         />
                       </div>
                       <div>
                         <label className="block text-sm font-bold text-slate-700 mb-1.5">联系电话 (手机号)</label>
                         <input 
                           type="text" 
                           value={profile.phone} 
                           onChange={e => setProfile({...profile, phone: e.target.value})}
                           className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" 
                         />
                       </div>
                       <div className="col-span-2">
                         <label className="block text-sm font-bold text-slate-700 mb-1.5">机构/企业名称</label>
                         <input 
                           type="text" 
                           value={profile.orgName} 
                           onChange={e => setProfile({...profile, orgName: e.target.value})}
                           className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors" 
                         />
                       </div>
                       <div className="col-span-2">
                         <label className="block text-sm font-bold text-slate-700 mb-1.5">企业总部地址</label>
                         <textarea 
                           value={profile.address} 
                           onChange={e => setProfile({...profile, address: e.target.value})}
                           rows={2} 
                           className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors resize-none"
                         ></textarea>
                       </div>
                    </div>
                 </div>
              </motion.div>
           )}
           
           {activeTab === 'security' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
                 <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">安全设置</h3>
                 
                 <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                             <KeyRound className="w-5 h-5" />
                          </div>
                          <div>
                             <h4 className="font-bold text-slate-800 text-sm">账户登录密码</h4>
                             <p className="text-xs text-slate-500 mt-0.5">建议定期更改密码以保证账户安全，上次更新时间: 2026.01.05</p>
                          </div>
                       </div>
                       <button className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-200 transition-colors">修改密码</button>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                             <Shield className="w-5 h-5" />
                          </div>
                          <div>
                             <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">系统防伪验签验证 <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded">已开启</span></h4>
                             <p className="text-xs text-slate-500 mt-0.5">强制校验设备硬件令牌与区块链身份数字证书</p>
                          </div>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                       </label>
                    </div>
                 </div>
              </motion.div>
           )}
           
           {activeTab === 'notifications' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
                 <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">通知订阅规则配置面板</h3>
                 <p className="text-sm text-slate-500 mb-6">根据当前角色权限，配置需要接收推送至总台大屏或移动端的警示通知类型。</p>
                 
                 <div className="space-y-0 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    {[
                      { title: '施肥/农事操作超期预警', desc: '当所负责地块存在逾期未执行完毕的种植任务时主动触发推送。', on: true },
                      { title: '地块 IoT 设备异常报警', desc: '包含传感失灵、环境数据连续10分钟超出阈值上限。', on: true },
                      { title: '批次溯源查询统计与防伪告警', desc: '在防伪标签短时间内异地被多次扫描或发生异常防伪验证时推送。', on: true },
                      { title: '区块链智能合约对账结果简报', desc: '汇总上周所有农事记录和流转节点数据的上链存校验结果。', on: false },
                    ].map((item, i) => (
                      <div key={i} className={`flex items-center justify-between p-4 bg-white ${i !== 3 ? 'border-b border-slate-100' : ''}`}>
                         <div>
                            <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                         </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked={item.on} />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                         </label>
                      </div>
                    ))}
                 </div>
              </motion.div>
           )}

           {activeTab === 'system' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
                 <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">系统全局参数</h3>
                 
                 <div className="space-y-6">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 mb-3">区域设置</h4>
                       <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">系统时区</label>
                            <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500">
                               <option>UTC+08:00 (北京时间)</option>
                               <option>UTC+00:00 (格林威治)</option>
                            </select>
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">数据大屏默认展示周期</label>
                            <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500">
                               <option>近30天</option>
                               <option>近7天</option>
                               <option>全部全量</option>
                            </select>
                         </div>
                       </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100">
                       <h4 className="font-bold text-sm text-slate-800 mb-3">溯源与区块链网络</h4>
                       <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">接口接入节点网络</label>
                          <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 shadow-sm">
                             <option>BSN 联盟链 (国密 SM2/SM3/SM4)</option>
                             <option>公链 (以太坊主网)</option>
                             <option>开发测试网</option>
                          </select>
                       </div>
                    </div>
                    <div className="pt-6">
                       <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition shadow-sm w-full md:w-auto disabled:opacity-50">
                         {isSaving ? '保存中...' : '保存所有参数更改'}
                       </button>
                    </div>
                 </div>
              </motion.div>
           )}
        </div>
      </div>
    </div>
  );
}
