import { useState } from 'react';
import { Lock, User, QrCode } from 'lucide-react';
import { useAuth } from '../auth/auth-context';

export default function AppLogin() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

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
          <div className="mb-8 border-b border-white/10 pb-4">
            <span className="text-sm font-bold text-white border-b-2 border-emerald-400 pb-2">系统登录</span>
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-username" className="block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">登录账号</label>
              <div className="relative">
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 transition-colors text-sm"
                  placeholder="请输入用户名"
                  required
                />
                <User className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">密码</label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 transition-colors text-sm"
                  placeholder="••••••••"
                  required
                />
                <Lock className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            {error && <p className="text-rose-400 text-xs font-medium">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] mt-8 disabled:opacity-50"
            >
              {submitting ? '登录中…' : '安全登录'}
            </button>
          </form>
        </div>
        <p className="text-center text-white/30 text-xs mt-8 font-medium">
          &copy; 2026 数字农业溯源系统版. All rights reserved.
        </p>
      </div>
    </div>
  );
}
