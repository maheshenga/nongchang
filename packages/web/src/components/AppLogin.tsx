import { useRef, useState } from 'react';
import { Building2, Lock, QrCode, User } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { fluentButton, fluentInput } from '../ui/fluent';
import { PRODUCT_NAME } from '../ui/branding';

interface AppLoginProps {
  onBackToLanding?: () => void;
}

export default function AppLogin({ onBackToLanding }: AppLoginProps) {
  const { login } = useAuth();
  const [tenantCode, setTenantCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      await login({ tenantCode, username, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-10 text-[#242424]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#0078D4]" />
      <main className="grid w-full max-w-5xl overflow-hidden border border-[#E1DFDD] bg-white shadow-sm md:grid-cols-[1fr_420px]">
        <section className="hidden border-r border-[#E1DFDD] bg-[#FAFAFA] p-10 md:flex md:flex-col md:justify-between">
          <div>
            <div className="mb-8 inline-flex h-10 w-10 items-center justify-center rounded-[4px] bg-[#0078D4] text-white">
              <QrCode className="h-5 w-5" />
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#605E5C]">Traceability SaaS</p>
            <h1 className="max-w-sm text-3xl font-semibold leading-tight text-[#242424]">农业溯源 SaaS 平台</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#605E5C]">全链路资料留档与数字农业协作，面向租户、代理商与商户的统一管理入口。</p>
          </div>
          <div className="text-xs leading-5 text-[#605E5C]">
            <div className="font-semibold text-[#323130]">{PRODUCT_NAME}</div>
            <div>Microsoft Fluent 风格控制台</div>
          </div>
        </section>

        <section className="p-6 sm:p-8">
          {onBackToLanding && (
            <button type="button" onClick={onBackToLanding} className={`${fluentButton('secondary')} mb-4`}>
              返回介绍页
            </button>
          )}

          <div className="mb-8 md:hidden">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[4px] bg-[#0078D4] text-white">
              <QrCode className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold text-[#242424]">农业溯源 SaaS 平台</h1>
            <p className="mt-2 text-sm text-[#605E5C]">全链路资料留档与数字农业协作</p>
          </div>

          <div className="mb-6 border-b border-[#E1DFDD] pb-4">
            <h2 className="text-xl font-semibold text-[#242424]">系统登录</h2>
            <p className="mt-1 text-sm text-[#605E5C]">请输入租户机构编码与账号信息。</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-tenant" className="mb-1.5 block text-sm font-semibold text-[#323130]">机构编码</label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
                <input
                  id="login-tenant"
                  type="text"
                  autoComplete="organization"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value)}
                  className={`${fluentInput} w-full pl-8`}
                  placeholder="请输入机构编码"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-username" className="mb-1.5 block text-sm font-semibold text-[#323130]">登录账号</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${fluentInput} w-full pl-8`}
                  placeholder="请输入用户名"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-[#323130]">密码</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${fluentInput} w-full pl-8`}
                  placeholder="••••••••"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="border border-[#F1C6CA] bg-[#FDE7E9] px-3 py-2 text-sm font-semibold text-[#A4262C]">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className={`${fluentButton('primary')} mt-2 w-full`}>
              {submitting ? '登录中...' : '安全登录'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-[#605E5C]">
            © 2026 数字农业溯源系统. All rights reserved.
          </p>
        </section>
      </main>
    </div>
  );
}
