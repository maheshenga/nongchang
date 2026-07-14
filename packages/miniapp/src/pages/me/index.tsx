import { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { PublicLegalQuery } from '@nongchang/shared';
import { getToken, clearToken } from '../../store/auth';
import { request } from '../../api/request';
import { getMe } from '../../api/auth';
import { listBatches, listFields, type Field, type FarmRecord } from '../../api/farm';
import { decodeToken, roleLabel } from '../../utils/token';
import { countThisMonth } from '../../utils/stats';
import { SUPPORT_CONTACT, WX_APPID } from '../../config/env';
import { buildSupportMessage } from '../../utils/support';
import { buildLegalDocumentUrl } from '../../components/LegalConsent/model';
import MeFieldSection from './MeFieldSection';
import MeLegalAccountSection from './MeLegalAccountSection';
import MeProfileHeader from './MeProfileHeader';
import MeStatsSection from './MeStatsSection';
import './index.scss';

const LEGAL_LOOKUP: PublicLegalQuery | null = WX_APPID ? { appId: WX_APPID } : null;
const openAccountData = () => Taro.navigateTo({ url: '/pages/account-data/index' });
const openAccountClosure = () => Taro.navigateTo({ url: '/pages/close-account/index' });
const openProfileEdit = () => Taro.navigateTo({ url: '/pages/profile-edit/index' });
const openPasswordChange = () => Taro.navigateTo({ url: '/pages/password-change/index' });
const openLegal = (kind: 'privacy' | 'agreement') => {
  if (LEGAL_LOOKUP) Taro.navigateTo({ url: buildLegalDocumentUrl(kind, LEGAL_LOOKUP) });
};

export default function Me() {
  const [username, setUsername] = useState('账户加载中');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState<string>('');
  const [role, setRole] = useState('身份加载中');
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [monthCount, setMonthCount] = useState<number | null>(null);
  const [batchCount, setBatchCount] = useState<number | null>(null);
  const [fieldCount, setFieldCount] = useState<number | null>(null);
  const [fields, setFields] = useState<Field[] | null>(null);

  useDidShow(() => {
    const token = getToken();
    if (!token) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const p = decodeToken(token);
    if (p?.username) setUsername(p.username);
    setRole(roleLabel(p?.role));
    setRoleCode(p?.role ?? null);
    void loadProfile();
    void loadStats();
  });

  async function loadProfile() {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const me = await getMe();
      setUsername(me.username);
      setDisplayName(me.displayName);
      setPhone(me.phone ?? '');
      setRole(roleLabel(me.role));
      setRoleCode(me.role);
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

  const profileHeaderProps = { displayName, username, role, phone, loading: profileLoading, error: profileError };

  return (
    <View className="me">
      <MeProfileHeader {...profileHeaderProps} onRetry={() => void loadProfile()} />

      <MeStatsSection monthCount={monthCount} batchCount={batchCount} fieldCount={fieldCount} />

      <View className="me__menu-section">
        <Text className="me__section-title">账号设置</Text>
        <Button className="nc-button-reset me__item" onClick={openProfileEdit}>
          <Text className="me__item-text">修改个人资料</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
        <Button className="nc-button-reset me__item" onClick={openPasswordChange}>
          <Text className="me__item-text">修改登录密码</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
      </View>

      <MeLegalAccountSection
        roleCode={roleCode}
        legalLookup={LEGAL_LOOKUP}
        onOpenData={openAccountData}
        onOpenLegal={openLegal}
        onOpenClosure={openAccountClosure}
      />

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

      <Button className="nc-button-reset me__logout" onClick={logout}>
        <Text className="me__logout-text">退出登录</Text>
      </Button>
    </View>
  );
}
