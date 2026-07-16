import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, Loader2, User, X } from 'lucide-react';
import type { MeProfileView } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { getMe, updateMe, changePassword } from '../api/auth';
import { useAuth } from '../auth/auth-context';
import { fluentButton, fluentFocus, fluentInput } from '../ui/fluent';
import { ErrorState, LoadingState } from '../ui/state';

const ROLE_LABEL: Record<string, string> = {
  platform_admin: '平台管理员',
  system_admin: '总管理员',
  agent_admin: '代理商',
  merchant: '商家',
  merchant_admin: '商家',
  member: '普通会员',
};

const labelClass = 'mb-1 block text-xs font-semibold text-[#605E5C]';
const fieldValueClass = 'mt-1 block text-sm font-semibold text-[#242424]';
const alertClass = 'border border-[#F1B8BD] bg-[#FDE7E9] px-3 py-2 text-sm text-[#A4262C]';
const successClass = 'inline-flex items-center gap-1.5 text-xs font-semibold text-[#107C10]';

function tabClass(active: boolean): string {
  return `inline-flex h-8 flex-1 items-center justify-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors ${fluentFocus} ${
    active
      ? 'border-b-[#0078D4] bg-[#EFF6FC] text-[#005A9E]'
      : 'border-b-transparent text-[#605E5C] hover:bg-[#F3F2F1] hover:text-[#242424]'
  }`;
}

export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const meApi = useApi(getMe);
  const { updateProfile, logout } = useAuth();
  const [localMe, setLocalMe] = useState<MeProfileView | null>(null);
  const me: MeProfileView | null = localMe ?? meApi.data;
  const [tab, setTab] = useState<'profile' | 'password'>('profile');

  useEffect(() => {
    setLocalMe(meApi.data);
  }, [meApi.data]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="fluent-scrollbar flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto border border-[#E1DFDD] bg-white">
        <div className="flex min-h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-3">
          <h3 id="profile-modal-title" className="text-base font-semibold text-[#242424]">个人账号设置</h3>
          <button type="button" onClick={onClose} aria-label="关闭" className={fluentButton('icon')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-[#E1DFDD] bg-white px-5 pt-2">
          <button type="button" onClick={() => setTab('profile')} className={tabClass(tab === 'profile')}>
            <User className="h-4 w-4" />
            个人资料
          </button>
          <button type="button" onClick={() => setTab('password')} className={tabClass(tab === 'password')}>
            <KeyRound className="h-4 w-4" />
            修改密码
          </button>
        </div>

        <div className="px-5 py-5">
          {meApi.loading && <LoadingState label="加载账号资料中..." />}
          {meApi.error && <ErrorState message={meApi.error} onRetry={() => void meApi.reload()} />}

          {me && tab === 'profile' && <ProfileForm me={me} onSaved={(updated) => {
            setLocalMe(updated);
            updateProfile(updated);
          }} />}
          {me && tab === 'password' && <PasswordForm onPasswordChanged={logout} />}
        </div>
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
    setErr(null);
    setOk(false);
    if (displayName.trim().length < 2) {
      setErr('昵称至少 2 个字');
      return;
    }
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
      <div className="grid grid-cols-2 gap-3 border border-[#E1DFDD] bg-[#FAFAFA] p-3 text-sm">
        <div>
          <span className="block text-xs font-semibold text-[#605E5C]">账号</span>
          <span className={`${fieldValueClass} font-mono`}>{me.username}</span>
        </div>
        <div>
          <span className="block text-xs font-semibold text-[#605E5C]">角色</span>
          <span className={fieldValueClass}>{ROLE_LABEL[me.role] ?? me.role}</span>
        </div>
      </div>

      <div>
        <label htmlFor="me-name" className={labelClass}>昵称</label>
        <input id="me-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className={`${fluentInput} w-full`} />
      </div>
      <div>
        <label htmlFor="me-phone" className={labelClass}>手机号</label>
        <input id="me-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="选填" className={`${fluentInput} w-full`} />
      </div>

      {err && <p role="alert" className={alertClass}>{err}</p>}
      {ok && <p className={successClass}><CheckCircle2 className="h-4 w-4" />资料已更新</p>}

      <div className="flex justify-end border-t border-[#E1DFDD] pt-4">
        <button type="submit" disabled={submitting} className={fluentButton('primary')}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          保存
        </button>
      </div>
    </form>
  );
}

function PasswordForm({ onPasswordChanged }: { onPasswordChanged: () => Promise<void> }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(false);
    if (newPassword.length < 6) {
      setErr('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirm) {
      setErr('两次新密码不一致');
      return;
    }
    if (newPassword === oldPassword) {
      setErr('新密码不能与旧密码相同');
      return;
    }
    setSubmitting(true);
    try {
      await changePassword({ oldPassword, newPassword });
      await onPasswordChanged();
      setOk(true);
      setOldPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="me-oldpwd" className={labelClass}>原密码</label>
        <input id="me-oldpwd" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className={`${fluentInput} w-full`} />
      </div>
      <div>
        <label htmlFor="me-newpwd" className={labelClass}>新密码</label>
        <input id="me-newpwd" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="至少 6 位" className={`${fluentInput} w-full`} />
      </div>
      <div>
        <label htmlFor="me-confirmpwd" className={labelClass}>确认新密码</label>
        <input id="me-confirmpwd" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={`${fluentInput} w-full`} />
      </div>

      {err && <p role="alert" className={alertClass}>{err}</p>}
      {ok && <p className={successClass}><CheckCircle2 className="h-4 w-4" />密码已修改</p>}

      <div className="flex justify-end border-t border-[#E1DFDD] pt-4">
        <button type="submit" disabled={submitting} className={fluentButton('primary')}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          确认修改
        </button>
      </div>
    </form>
  );
}
