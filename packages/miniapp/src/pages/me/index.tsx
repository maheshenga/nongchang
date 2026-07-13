import { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken, clearToken } from '../../store/auth';
import { request } from '../../api/request';
import { getMe, updateMe, changePassword } from '../../api/auth';
import { listBatches, listFields, type Field, type FarmRecord } from '../../api/farm';
import { decodeToken, roleLabel } from '../../utils/token';
import { countThisMonth } from '../../utils/stats';
import { SUPPORT_CONTACT } from '../../config/env';
import { buildSupportMessage } from '../../utils/support';
import MeFieldSection from './MeFieldSection';
import MeProfileHeader from './MeProfileHeader';
import './index.scss';

export default function Me() {
  const [username, setUsername] = useState('账户加载中');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState<string>('');
  const [role, setRole] = useState('身份加载中');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [monthCount, setMonthCount] = useState<number | null>(null);
  const [batchCount, setBatchCount] = useState<number | null>(null);
  const [fieldCount, setFieldCount] = useState<number | null>(null);
  const [fields, setFields] = useState<Field[] | null>(null);

  // 编辑资料面板
  const [editing, setEditing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // 修改密码面板
  const [pwdPanel, setPwdPanel] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  useDidShow(() => {
    const token = getToken();
    if (!token) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const p = decodeToken(token);
    if (p?.username) setUsername(p.username);
    setRole(roleLabel(p?.role));
    void loadProfile();
    void loadStats();
  });

  // 从 /auth/me 拉真实资料(displayName/phone 以服务端为准)
  async function loadProfile() {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const me = await getMe();
      setUsername(me.username);
      setDisplayName(me.displayName);
      setPhone(me.phone ?? '');
      setRole(roleLabel(me.role));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '账户资料加载失败');
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadStats() {
    try {
      // /farm-records 返回分页对象 {items,total,page,pageSize},取 items 统计本月记录数
      const res = await request<{ items: FarmRecord[] }>({ url: '/farm-records' });
      setMonthCount(countThisMonth(res.items as any, new Date()));
    } catch {
      setMonthCount(null);
    }
    listBatches().then((bs) => setBatchCount(bs.length)).catch(() => setBatchCount(null));
    listFields().then((fs) => setFieldCount(fs.length)).catch(() => setFieldCount(null));
  }

  const comingSoon = () => Taro.showToast({ title: '功能即将开放', icon: 'none' });

  async function toggleFields() {
    if (fields) { setFields(null); return; }
    try {
      setFields(await listFields());
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载地块失败', icon: 'none' });
    }
  }

  function showHelp() {
    Taro.showModal({
      title: '系统帮助与客服',
      content: buildSupportMessage(SUPPORT_CONTACT),
      showCancel: false,
    });
  }

  function logout() {
    clearToken();
    Taro.redirectTo({ url: '/pages/login/index' });
  }

  function openEdit() {
    setFormName(displayName);
    setFormPhone(phone);
    setPwdPanel(false);
    setEditing(true);
  }

  async function saveProfile() {
    if (formName.trim().length < 2) {
      Taro.showToast({ title: '昵称至少 2 个字', icon: 'none' });
      return;
    }
    setSavingProfile(true);
    try {
      const me = await updateMe({ displayName: formName.trim(), phone: formPhone.trim() || null });
      setDisplayName(me.displayName);
      setPhone(me.phone ?? '');
      setEditing(false);
      Taro.showToast({ title: '资料已更新', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSavingProfile(false);
    }
  }

  function openPwd() {
    setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    setEditing(false);
    setPwdPanel(true);
  }

  async function savePwd() {
    if (newPwd.length < 6) {
      Taro.showToast({ title: '新密码至少 6 位', icon: 'none' });
      return;
    }
    if (newPwd !== confirmPwd) {
      Taro.showToast({ title: '两次新密码不一致', icon: 'none' });
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword(oldPwd, newPwd);
      setPwdPanel(false);
      Taro.showToast({ title: '密码已修改', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '修改失败', icon: 'none' });
    } finally {
      setSavingPwd(false);
    }
  }
  const profileHeaderProps = { displayName, username, role, phone, loading: profileLoading, error: profileError };

  return (
    <View className="me">
      <MeProfileHeader {...profileHeaderProps} onRetry={() => void loadProfile()} />

      <View className="me__stats">
        <View className="me__stat">
          <Text className="me__stat-num">{monthCount ?? '—'}</Text>
          <Text className="me__stat-label">本月记录</Text>
        </View>
        <View className="me__stat">
          <Text className="me__stat-num">{batchCount ?? '—'}</Text>
          <Text className="me__stat-label">在管批次</Text>
        </View>
        <View className="me__stat">
          <Text className="me__stat-num">{fieldCount ?? '—'}</Text>
          <Text className="me__stat-label">承包地块</Text>
        </View>
      </View>

      <View className="me__menu-section">
        <Text className="me__section-title">账号设置</Text>
        <Button className="nc-button-reset me__item" onClick={openEdit}>
          <Text className="me__item-text">修改个人资料</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
        <Button className="nc-button-reset me__item" onClick={openPwd}>
          <Text className="me__item-text">修改登录密码</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
        <Button className="nc-button-reset me__item me__item--reserved" onClick={comingSoon}>
          <Text className="me__item-text">蓝牙传感设备配置</Text>
          <Text className="me__item-badge">即将开放</Text>
        </Button>
      </View>

      <View className="me__menu-section">
        <Text className="me__section-title">农场服务</Text>
        <MeFieldSection fields={fields} onToggle={() => void toggleFields()} />
        <Button className="nc-button-reset me__item" onClick={() => Taro.navigateTo({ url: '/pages/usage/index' })}>
          <Text className="me__item-text">算力与额度用量</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
        <Button className="nc-button-reset me__item" onClick={() => Taro.switchTab({ url: '/pages/trace/index' })}>
          <Text className="me__item-text">溯源记录</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
        <Button className="nc-button-reset me__item" onClick={showHelp}>
          <Text className="me__item-text">系统帮助与客服</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
      </View>

      {editing && (
        <View className="me__panel">
          <Text className="me__panel-title">修改个人资料</Text>
          <Text className="me__panel-label">昵称</Text>
          <Input className="me__panel-input" value={formName} placeholder="请输入昵称" onInput={(e) => setFormName(e.detail.value)} />
          <Text className="me__panel-label">手机号</Text>
          <Input className="me__panel-input" type="number" value={formPhone} placeholder="选填" onInput={(e) => setFormPhone(e.detail.value)} />
          <View className="me__panel-actions">
            <Button className="me__panel-btn me__panel-btn--ghost" onClick={() => setEditing(false)}>取消</Button>
            <Button className="me__panel-btn" loading={savingProfile} onClick={saveProfile}>保存</Button>
          </View>
        </View>
      )}

      {pwdPanel && (
        <View className="me__panel">
          <Text className="me__panel-title">修改登录密码</Text>
          <Text className="me__panel-label">原密码</Text>
          <Input className="me__panel-input" password value={oldPwd} placeholder="请输入原密码" onInput={(e) => setOldPwd(e.detail.value)} />
          <Text className="me__panel-label">新密码</Text>
          <Input className="me__panel-input" password value={newPwd} placeholder="至少 6 位" onInput={(e) => setNewPwd(e.detail.value)} />
          <Text className="me__panel-label">确认新密码</Text>
          <Input className="me__panel-input" password value={confirmPwd} placeholder="再次输入新密码" onInput={(e) => setConfirmPwd(e.detail.value)} />
          <View className="me__panel-actions">
            <Button className="me__panel-btn me__panel-btn--ghost" onClick={() => setPwdPanel(false)}>取消</Button>
            <Button className="me__panel-btn" loading={savingPwd} onClick={savePwd}>确认修改</Button>
          </View>
        </View>
      )}

      <Button className="nc-button-reset me__logout" onClick={logout}>
        <Text className="me__logout-text">退出登录</Text>
      </Button>
    </View>
  );
}
