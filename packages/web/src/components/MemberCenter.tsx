import { useState, type FormEvent } from 'react';
import { Search, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { fluentButton, fluentInput, fluentStatusTag } from '../ui/fluent';

export default function MemberCenter() {
  const { profile, user } = useAuth();
  const [traceCode, setTraceCode] = useState('');
  const [error, setError] = useState('');
  const displayName = profile?.displayName ?? user?.userId ?? '普通会员';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const code = traceCode.trim();
    if (!code) {
      setError('请输入溯源码');
      return;
    }
    setError('');
    window.location.hash = `#/trace/${encodeURIComponent(code)}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <UserRound className="h-5 w-5 text-[#0078D4]" />
            会员中心
          </h2>
          <p className="mt-1 text-sm text-[#605E5C]">查询购买商品的公开溯源记录，并管理当前账户偏好。</p>
        </div>
        <span className={fluentStatusTag('active')}>会员账户</span>
      </header>

      <main className="fluent-scrollbar min-h-0 flex-1 overflow-y-auto">
        <section className="max-w-2xl border border-[#E1DFDD] bg-white">
          <div className="border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
              <ShieldCheck className="h-4 w-4 text-[#0078D4]" />
              溯源码查询
            </div>
            <p className="mt-1 text-xs leading-5 text-[#605E5C]">查询后会打开真实公开溯源记录，不生成演示数据。</p>
          </div>

          <form onSubmit={submit} className="space-y-4 p-5">
            <div>
              <label htmlFor="member-trace-code" className="mb-1.5 block text-sm font-semibold text-[#323130]">溯源码</label>
              <input
                id="member-trace-code"
                value={traceCode}
                onChange={(event) => {
                  setTraceCode(event.target.value);
                  if (error) setError('');
                }}
                className={`${fluentInput} w-full`}
                placeholder="输入商品包装上的溯源码"
              />
            </div>
            {error && <p className="text-sm font-semibold text-[#A4262C]">{error}</p>}
            <button type="submit" className={fluentButton('primary')}>
              <Search className="h-4 w-4" />
              查询溯源
            </button>
          </form>

          <div className="border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 text-xs leading-5 text-[#605E5C]">
            当前账户: <span className="font-semibold text-[#242424]">{displayName}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
