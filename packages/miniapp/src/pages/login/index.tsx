import { useEffect, useRef, useState } from 'react';
import { View, Input, Button, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ConfiguredPublicLegal, PublicLegalQuery } from '@nongchang/shared';
import { login, loginWechat } from '../../api/auth';
import { getPublicLegal } from '../../api/legal';
import { SUPPORT_CONTACT, WX_APPID } from '../../config/env';
import Icon from '../../components/Icon';
import LegalConsent from '../../components/LegalConsent';
import { buildSupportMessage } from '../../utils/support';
import { canStartLogin, legalLookupTenantCode, normalizePasswordLogin } from './model';
import './index.scss';

export default function Login() {
  const [tenantCode, setTenantCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [wxLoading, setWxLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [legal, setLegal] = useState<ConfiguredPublicLegal | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [legalLookup, setLegalLookup] = useState<PublicLegalQuery | null>(null);
  const [legalLookupCode, setLegalLookupCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const legalRequestId = useRef(0);
  const busy = loading || wxLoading;

  async function loadLegal(lookup: PublicLegalQuery, lookupCode: string | null) {
    const requestId = ++legalRequestId.current;
    setAuthorized(false);
    setLegal(null);
    setLegalLookup(lookup);
    setLegalLookupCode(null);
    setLegalLoading(true);
    setLegalError(null);
    try {
      const response = await getPublicLegal(lookup);
      if (requestId !== legalRequestId.current) return;
      if (response.configured) {
        setLegal(response);
        setLegalLookupCode(lookupCode);
      }
    } catch (e: unknown) {
      if (requestId !== legalRequestId.current) return;
      setLegalError(e instanceof Error ? e.message : '协议加载失败');
    } finally {
      if (requestId === legalRequestId.current) setLegalLoading(false);
    }
  }

  useEffect(() => {
    if (WX_APPID) void loadLegal({ appId: WX_APPID }, null);
  }, []);

  function loginAvailability(method: 'password' | 'wechat', code = tenantCode) {
    return {
      passwordLoading: loading,
      wechatLoading: wxLoading,
      authorized,
      publicationId: legal?.publicationId ?? null,
      legalLoading,
      legalError,
      method,
      tenantCode: code,
      legalLookupCode,
    };
  }

  function assertCanStart(method: 'password' | 'wechat', code = tenantCode): boolean {
    if (canStartLogin(loginAvailability(method, code))) return true;
    if (legalLoading) setError('协议加载中，加载完成前不能登录');
    else if (legalError) setError(legalError);
    else if (!legal) setError('协议尚未配置，请联系管理员');
    else if (!authorized) setError('请先阅读并同意《用户协议》和《隐私政策》');
    else if (method === 'password') setError('请先加载当前机构的协议');
    return false;
  }

  function legalQueryForTenant(code: string): PublicLegalQuery {
    return { tenantCode: code, ...(WX_APPID ? { appId: WX_APPID } : {}) };
  }

  async function onTenantBlur() {
    const code = tenantCode.trim().toUpperCase();
    setTenantCode(code);
    if (code) {
      await loadLegal(legalQueryForTenant(code), code);
    } else if (WX_APPID) {
      await loadLegal({ appId: WX_APPID }, null);
    }
  }

  async function reloadAfterConflict(method: 'password' | 'wechat', code: string) {
    if (method === 'password') await loadLegal(legalQueryForTenant(code), code);
    else if (WX_APPID) await loadLegal({ appId: WX_APPID }, null);
  }

  function isPublicationConflict(e: unknown): boolean {
    return typeof e === 'object' && e !== null && 'status' in e
      && (e as { status?: unknown }).status === 409;
  }

  async function onSubmit() {
    const normalized = normalizePasswordLogin({ tenantCode, username, password });
    if (!normalized.tenantCode || !normalized.username || !normalized.password) {
      setError('请输入机构编码、账号和密码');
      return;
    }
    if (!assertCanStart('password', normalized.tenantCode) || !legal) return;
    setTenantCode(normalized.tenantCode);
    setUsername(normalized.username);
    setPassword(normalized.password);
    setError(null);
    setLoading(true);
    try {
      await login(
        normalized.tenantCode,
        normalized.username,
        normalized.password,
        legal.publicationId,
      );
      Taro.switchTab({ url: '/pages/work/index' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '登录失败';
      if (isPublicationConflict(e)) {
        await reloadAfterConflict('password', normalized.tenantCode);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function onWechatLogin() {
    if (!assertCanStart('wechat') || !legal) return;
    if (!WX_APPID) {
      setError('未配置微信登录，请联系平台管理员');
      return;
    }
    setError(null);
    setWxLoading(true);
    try {
      await loginWechat(legal.publicationId);
      Taro.switchTab({ url: '/pages/work/index' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '微信登录失败';
      if (isPublicationConflict(e)) await reloadAfterConflict('wechat', '');
      setError(message);
      if (/未注册/.test(message)) {
        Taro.showModal({
          title: '尚未注册',
          content: '该微信还未注册账号，是否前往申请入驻？',
          confirmText: '去注册',
          success: result => {
            if (result.confirm) Taro.navigateTo({ url: '/pages/register/index' });
          },
        });
      }
    } finally {
      setWxLoading(false);
    }
  }

  const passwordReady = canStartLogin(loginAvailability('password'));
  const wechatReady = canStartLogin(loginAvailability('wechat')) && Boolean(WX_APPID);
  const goRegister = () => Taro.navigateTo({ url: '/pages/register/index' });
  const clearError = () => setError(null);

  function onTenantInput(value: string) {
    legalRequestId.current += 1;
    setTenantCode(value);
    setAuthorized(false);
    setLegal(null);
    setLegalLookup(null);
    setLegalLookupCode(null);
    setLegalLoading(false);
    setLegalError(null);
    clearError();
  }

  function retryLegal() {
    if (legalLookup) void loadLegal(legalLookup, legalLookupTenantCode(legalLookup));
    else if (WX_APPID) void loadLegal({ appId: WX_APPID }, null);
  }

  function showPasswordRecovery() {
    Taro.showModal({
      title: '忘记密码',
      content: buildSupportMessage(SUPPORT_CONTACT),
      showCancel: false,
    });
  }

  return (
    <View className="login">
      <View className="login__hero">
        <View className="login__logo">
          <Icon name="leaf" color="#fff" size={40} />
        </View>
        <Text className="login__title">溯源工作台</Text>
        <Text className="login__subtitle">田间作业、物料核销、批次溯源一站处理</Text>
        <View className="login__trust">
          <Text className="login__trust-item">农事记录</Text>
          <Text className="login__trust-item">扫码追溯</Text>
          <Text className="login__trust-item">额度可控</Text>
        </View>
      </View>

      <View className="login__card">
        <View className="login__card-head">
          <Text className="login__card-title">登录到农场</Text>
          <Text className="login__card-sub">使用机构账号继续作业</Text>
        </View>
        <Text className="login__label">机构编码</Text>
        <Input
          className="login__input"
          placeholder="请输入机构编码"
          value={tenantCode}
          onInput={event => onTenantInput(event.detail.value)}
          onBlur={() => void onTenantBlur()}
        />
        <Text className="login__label">账号</Text>
        <Input
          className="login__input"
          placeholder="手机号 / 用户名"
          value={username}
          onInput={(event) => { setUsername(event.detail.value); clearError(); }}
        />
        <Text className="login__label">服务密码</Text>
        <Input
          className="login__input"
          password
          placeholder="请输入服务密码"
          value={password}
          onInput={(event) => { setPassword(event.detail.value); clearError(); }}
        />
        <Button className="login__recovery" onClick={showPasswordRecovery}>忘记密码</Button>
        <LegalConsent
          legal={legal}
          loading={legalLoading}
          error={legalError}
          checked={authorized}
          disabled={busy}
          lookup={legalLookup}
          onChecked={(checked) => { setAuthorized(checked); clearError(); }}
          onRetry={retryLegal}
        />
        {error && <Text className="login__error">{error}</Text>}
        <Button
          className="login__submit"
          loading={loading}
          disabled={!passwordReady}
          onClick={() => void onSubmit()}
        >
          安全登录
        </Button>
        <Button
          className="login__wechat"
          loading={wxLoading}
          disabled={!wechatReady}
          onClick={() => void onWechatLogin()}
        >
          <Icon name="user" size={20} color="#07c160" />
          <Text className="login__wechat-text">{wxLoading ? '登录中…' : '微信一键登录'}</Text>
        </Button>
        <Button className="nc-button-reset login__apply" onClick={goRegister}>
          <Text className="login__apply-text">没有账号？申请入驻</Text>
        </Button>
      </View>
    </View>
  );
}
