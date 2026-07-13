import { useState } from 'react';
import { View, Input, Button, Checkbox, CheckboxGroup, Label, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { login, loginWechat } from '../../api/auth';
import { SUPPORT_CONTACT, WX_APPID } from '../../config/env';
import Icon from '../../components/Icon';
import { buildSupportMessage } from '../../utils/support';
import { canStartLogin, normalizePasswordLogin } from './model';
import './index.scss';

export default function Login() {
  const [tenantCode, setTenantCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [wxLoading, setWxLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = loading || wxLoading;

  function assertCanStart(): boolean {
    if (busy) return false;
    if (!canStartLogin({ passwordLoading: loading, wechatLoading: wxLoading, authorized })) {
      setError('请先阅读并同意隐私与授权说明');
      return false;
    }
    return true;
  }

  async function onSubmit() {
    if (!assertCanStart()) return;
    const normalized = normalizePasswordLogin({ tenantCode, username, password });
    if (!normalized.tenantCode || !normalized.username || !normalized.password) {
      setError('请输入机构编码、账号和密码');
      return;
    }
    setTenantCode(normalized.tenantCode);
    setUsername(normalized.username);
    setPassword(normalized.password);
    setError(null);
    setLoading(true);
    try {
      await login(normalized.tenantCode, normalized.username, normalized.password);
      // work 为 tabBar 页，必须用 switchTab 跳转
      Taro.switchTab({ url: '/pages/work/index' });
    } catch (e: any) {
      setError(e?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  }

  async function onWechatLogin() {
    if (!assertCanStart()) return;
    if (!WX_APPID) {
      setError('未配置微信登录，请联系平台管理员');
      return;
    }
    setError(null);
    setWxLoading(true);
    try {
      await loginWechat();
      Taro.switchTab({ url: '/pages/work/index' });
    } catch (e: any) {
      const msg = e?.message || '微信登录失败';
      setError(msg);
      if (/未注册/.test(msg)) {
        Taro.showModal({
          title: '尚未注册',
          content: '该微信还未注册账号,是否前往申请入驻?',
          confirmText: '去注册',
          success: (r) => { if (r.confirm) Taro.navigateTo({ url: '/pages/register/index' }); },
        });
      }
    } finally {
      setWxLoading(false);
    }
  }

  const goRegister = () => Taro.navigateTo({ url: '/pages/register/index' });
  const clearError = () => setError(null);

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
          onInput={(e) => { setTenantCode(e.detail.value); clearError(); }}
        />
        <Text className="login__label">账号</Text>
        <Input
          className="login__input"
          placeholder="手机号 / 用户名"
          value={username}
          onInput={(e) => { setUsername(e.detail.value); clearError(); }}
        />
        <Text className="login__label">服务密码</Text>
        <Input
          className="login__input"
          password
          placeholder="请输入服务密码"
          value={password}
          onInput={(e) => { setPassword(e.detail.value); clearError(); }}
        />
        <Button className="login__recovery" onClick={showPasswordRecovery}>忘记密码</Button>
        <CheckboxGroup
          onChange={(event) => {
            setAuthorized(event.detail.value.includes('authorized'));
            clearError();
          }}
        >
          <Label className="login__consent">
            <Checkbox value="authorized" checked={authorized} disabled={busy} />
            <Text className="login__consent-text">我已阅读并同意隐私与授权说明</Text>
          </Label>
        </CheckboxGroup>
        {error && <Text className="login__error" role="alert">{error}</Text>}
        <Button className="login__submit" loading={loading} disabled={busy} onClick={() => void onSubmit()}>
          安全登录
        </Button>
        <Button className="login__wechat" loading={wxLoading} disabled={busy} onClick={() => void onWechatLogin()}>
          <Icon name="user" size={20} color="#07c160" />
          <Text className="login__wechat-text">{wxLoading ? '登录中…' : '微信一键登录'}</Text>
        </Button>
        <View className="login__apply" onClick={goRegister}>
          <Text className="login__apply-text">没有账号? 申请入驻</Text>
        </View>
      </View>
    </View>
  );
}
