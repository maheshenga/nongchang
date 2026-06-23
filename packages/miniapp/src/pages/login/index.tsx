import { useState } from 'react';
import { View, Input, Button, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { login, loginWechat } from '../../api/auth';
import { WX_APPID } from '../../config/env';
import Icon from '../../components/Icon';
import './index.scss';

export default function Login() {
  const [tenantCode, setTenantCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [wxLoading, setWxLoading] = useState(false);

  async function onSubmit() {
    if (!tenantCode || !username || !password) {
      Taro.showToast({ title: '请输入机构编码、账号和密码', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      await login(tenantCode, username, password);
      // work 为 tabBar 页，必须用 switchTab 跳转
      Taro.switchTab({ url: '/pages/work/index' });
    } catch (e: any) {
      Taro.showToast({ title: e.message || '登录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function onWechatLogin() {
    if (!WX_APPID) {
      Taro.showToast({ title: '未配置微信登录', icon: 'none' });
      return;
    }
    setWxLoading(true);
    try {
      await loginWechat();
      Taro.switchTab({ url: '/pages/work/index' });
    } catch (e: any) {
      const msg = e.message || '微信登录失败';
      if (/未注册/.test(msg)) {
        Taro.showModal({
          title: '尚未注册',
          content: '该微信还未注册账号,是否前往申请入驻?',
          confirmText: '去注册',
          success: (r) => { if (r.confirm) Taro.navigateTo({ url: '/pages/register/index' }); },
        });
      } else {
        Taro.showToast({ title: msg, icon: 'none' });
      }
    } finally {
      setWxLoading(false);
    }
  }

  const goRegister = () => Taro.navigateTo({ url: '/pages/register/index' });

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
          onInput={(e) => setTenantCode(e.detail.value)}
        />
        <Text className="login__label">账号</Text>
        <Input
          className="login__input"
          placeholder="手机号 / 用户名"
          value={username}
          onInput={(e) => setUsername(e.detail.value)}
        />
        <Text className="login__label">服务密码</Text>
        <Input
          className="login__input"
          password
          placeholder="请输入服务密码"
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
        />
        <Button className="login__submit" loading={loading} onClick={onSubmit}>
          安全登录
        </Button>
        <View className="login__wechat" onClick={wxLoading ? undefined : onWechatLogin}>
          <Icon name="user" size={20} color="#07c160" />
          <Text className="login__wechat-text">{wxLoading ? '登录中…' : '微信一键登录'}</Text>
        </View>
        <View className="login__apply" onClick={goRegister}>
          <Text className="login__apply-text">没有账号? 申请入驻</Text>
        </View>
      </View>
    </View>
  );
}
