import { useState } from 'react';
import { Leaf, Lock, Mail, QrCode } from 'lucide-react';

export default function AppLogin({ onLogin }: { onLogin: (role: string) => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1595166669963-c744f9c5d0ba?auto=format&fit=crop&w=1920&q=80')] bg-cover bg-center brightness-[0.2]" />
      
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 mx-auto mb-6">
            <QrCode className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">农业溯源 SaaS 平台</h1>
          <p className="text-emerald-100/70 font-medium tracking-wide text-sm">全链路数据上链与数字农业协作</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="flex gap-4 mb-8 border-b border-white/10 pb-4">
            <button 
              className={`flex-1 text-center text-sm font-bold pb-2 transition-all border-b-2 ${!isRegistering ? 'border-emerald-400 text-white' : 'border-transparent text-white/50 hover:text-white/80'}`}
              onClick={() => setIsRegistering(false)}
            >
              系统登录
            </button>
            <button 
              className={`flex-1 text-center text-sm font-bold pb-2 transition-all border-b-2 ${isRegistering ? 'border-emerald-400 text-white' : 'border-transparent text-white/50 hover:text-white/80'}`}
              onClick={() => setIsRegistering(true)}
            >
              商户注册
            </button>
          </div>

          <form className="space-y-5" onSubmit={(e) => {
            e.preventDefault();
            // Just simulate login by picking a role
            onLogin('merchant_admin');
          }}>
            <div>
              <label className="block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">
                {isRegistering ? '企业邮箱' : '登录账号'}
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 transition-colors text-sm"
                  placeholder={isRegistering ? "admin@company.com" : "请输入邮箱或手机号"}
                  required
                />
                <Mail className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">
                密码
              </label>
              <div className="relative">
                <input 
                  type="password" 
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 transition-colors text-sm"
                  placeholder="••••••••"
                  required
                />
                <Lock className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {!isRegistering && (
              <div className="flex justify-between items-center text-xs">
                <label className="flex items-center gap-2 text-white/60 cursor-pointer hover:text-white transition-colors">
                  <input type="checkbox" className="rounded border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500" />
                  自动登录
                </label>
                <a href="#" className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors">忘记密码?</a>
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] mt-8"
            >
              {isRegistering ? '申请注册' : '安全登录'}
            </button>
            
            {!isRegistering && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-center text-xs text-white/40 mb-4 font-medium uppercase tracking-widest">快捷体验通道</p>
                <div className="grid grid-cols-3 gap-3">
                  <button type="button" onClick={() => onLogin('system_admin')} className="py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-white/80 transition-colors border border-white/10">总管理台</button>
                  <button type="button" onClick={() => onLogin('agent_admin')} className="py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-white/80 transition-colors border border-white/10">代理商台</button>
                  <button type="button" onClick={() => onLogin('merchant_admin')} className="py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-white/80 transition-colors border border-white/10">商户后台</button>
                </div>
              </div>
            )}
          </form>
        </div>
        
        <p className="text-center text-white/30 text-xs mt-8 font-medium">
          &copy; 2026 数字农业溯源系统版. All rights reserved.
        </p>
      </div>
    </div>
  );
}
