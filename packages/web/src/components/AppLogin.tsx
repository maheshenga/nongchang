import { useState } from 'react';
import { Lock, User, QrCode, Building2 } from 'lucide-react';
import { useAuth } from '../auth/auth-context';

export default function AppLogin() {
  const { login } = useAuth();
  const [tenantCode, setTenantCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ tenantCode, username, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* 纯 CSS 深色背景:登录页是所有内部用户的入口,避免外链图弱网/无外网时门面降级 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 15%, rgba(6,78,59,0.95), transparent 55%), radial-gradient(circle at 80% 85%, rgba(15,118,110,0.85), transparent 50%), linear-gradient(160deg, #0f172a, #064e3b)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0C30 16 16 30 0 30c16 0 30 14 30 30 0-16 14-30 30-30-16 0-30-14-30-30z' fill='none' stroke='%23ffffff' stroke-width='0.6'/%3E%3C/svg%3E\")",
          backgroundSize: '60px 60px',
        }}
      />
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
              <label htmlFor="login-tenant" className="block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">机构编码</label>
              <div className="relative">
                <input
                  id="login-tenant"
                  type="text"
                  autoComplete="organization"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 transition-colors text-sm"
                  placeholder="请输入机构编码"
                  required
                />
                <Building2 className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
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
