import { useEffect, useState, type FormEvent } from 'react';
import { X, User, KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import type { MeProfileView } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { getMe, updateMe, changePassword } from '../api/auth';
import { useAuth } from '../auth/auth-context';

const ROLE_LABEL: Record<string, string> = {
  system_admin: '总管理员', agent_admin: '代理商', merchant: '商家',
};

const inputCls = 'mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500';

// 个人账号设置:任意角色自助查看资料、修改昵称/手机号、修改登录密码。
export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const meApi = useApi(getMe);
  const { updateProfile } = useAuth();
  const [localMe, setLocalMe] = useState<MeProfileView | null>(null);
  const me: MeProfileView | null = localMe ?? meApi.data;
  const [tab, setTab] = useState<'profile' | 'password'>('profile');

  useEffect(() => {
    setLocalMe(meApi.data);
  }, [meApi.data]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 id="profile-modal-title" className="font-bold text-slate-800 text-lg">个人账号设置</h3>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button onClick={() => setTab('profile')} className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${tab === 'profile' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <User className="w-4 h-4" /> 个人资料
          </button>
          <button onClick={() => setTab('password')} className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${tab === 'password' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <KeyRound className="w-4 h-4" /> 修改密码
          </button>
        </div>

        {meApi.loading && <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> 加载中…</div>}
        {meApi.error && <p className="text-rose-500 text-sm py-4">{meApi.error}</p>}

        {me && tab === 'profile' && <ProfileForm me={me} onSaved={(updated) => {
          setLocalMe(updated);
          updateProfile(updated);
        }} />}
        {me && tab === 'password' && <PasswordForm />}
      </div>
    </div>
  );
}

function ProfileForm({ me, onSaved }: { me: MeProfileView; onSaved: (me: MeProfileView) => void }) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(false);
    if (displayName.trim().length < 2) { setErr('昵称至少 2 个字'); return; }
    setSubmitting(true);
    try {
      const updated = await updateMe({ displayName: displayName.trim(), phone: phone.trim() || null });
      setDisplayName(updated.displayName);
      setPhone(updated.phone ?? '');
      setOk(true);
      onSaved(updated);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="block text-xs font-bold text-slate-500">账号</span>
          <span className="mt-1 block text-slate-800 font-mono">{me.username}</span>
        </div>
        <div>
          <span className="block text-xs font-bold text-slate-500">角色</span>
          <span className="mt-1 block text-slate-800">{ROLE_LABEL[me.role] ?? me.role}</span>
        </div>
      </div>

      <div>
        <label htmlFor="me-name" className="block text-xs font-bold text-slate-500">昵称</label>
        <input id="me-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className={inputCls} />
      </div>
      <div>
        <label htmlFor="me-phone" className="block text-xs font-bold text-slate-500">手机号</label>
        <input id="me-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="选填" className={inputCls} />
      </div>

      {err && <p className="text-rose-500 text-xs">{err}</p>}
      {ok && <p className="text-emerald-600 text-xs inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 资料已更新</p>}

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={submitting} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} 保存
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(false);
    if (newPassword.length < 6) { setErr('新密码至少 6 位'); return; }
    if (newPassword !== confirm) { setErr('两次新密码不一致'); return; }
    if (newPassword === oldPassword) { setErr('新密码不能与旧密码相同'); return; }
    setSubmitting(true);
    try {
      await changePassword({ oldPassword, newPassword });
      setOk(true);
      setOldPassword(''); setNewPassword(''); setConfirm('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="me-oldpwd" className="block text-xs font-bold text-slate-500">原密码</label>
        <input id="me-oldpwd" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className={inputCls} />
      </div>
      <div>
        <label htmlFor="me-newpwd" className="block text-xs font-bold text-slate-500">新密码</label>
        <input id="me-newpwd" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="至少 6 位" className={inputCls} />
      </div>
      <div>
        <label htmlFor="me-confirmpwd" className="block text-xs font-bold text-slate-500">确认新密码</label>
        <input id="me-confirmpwd" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={inputCls} />
      </div>

      {err && <p className="text-rose-500 text-xs">{err}</p>}
      {ok && <p className="text-emerald-600 text-xs inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 密码已修改</p>}

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={submitting} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} 确认修改
        </button>
      </div>
    </form>
  );
}
