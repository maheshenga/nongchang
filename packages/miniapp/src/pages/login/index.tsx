import { useState } from 'react';
import { View, Input, Button, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { login, loginWechat } from '../../api/auth';
import { WX_APPID } from '../../config/env';
import Icon from '../../components/Icon';
import './index.scss';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [wxLoading, setWxLoading] = useState(false);

  async function onSubmit() {
    if (!username || !password) {
      Taro.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
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
      Taro.showToast({ title: e.message || '微信登录失败', icon: 'none' });
    } finally {
      setWxLoading(false);
    }
  }

  const comingSoon = () => Taro.showToast({ title: '功能即将开放', icon: 'none' });

  return (
    <View className="login">
      <View className="login__hero">
        <View className="login__logo">
          <Icon name="leaf" color="#fff" size={40} />
        </View>
        <Text className="login__title">溯源工作台</Text>
        <Text className="login__subtitle">数字生态农业移动管理端 · 让每一次农事都被信任</Text>
      </View>

      <View className="login__card">
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
          <Text className="login__wechat-text">{wxLoading ? '登录中…' : '微信一键登录'}</Text>
        </View>
        <View className="login__apply" onClick={comingSoon}>
          <Text className="login__apply-text">没有账号? 申请入驻</Text>
        </View>
      </View>
    </View>
  );
}
