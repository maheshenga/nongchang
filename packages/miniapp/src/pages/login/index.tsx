import { useState } from 'react';
import { View, Input, Button, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { login } from '../../api/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!username || !password) {
      Taro.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      Taro.redirectTo({ url: '/pages/index/index' });
    } catch (e: any) {
      Taro.showToast({ title: e.message || '登录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ padding: '48px 32px' }}>
      <Text style={{ fontSize: '40px', fontWeight: 'bold', color: '#2e7d32' }}>农事记录</Text>
      <View style={{ marginTop: '48px' }}>
        <Input
          placeholder="账号"
          value={username}
          onInput={e => setUsername(e.detail.value)}
          style={{ background: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px' }}
        />
        <Input
          password
          placeholder="密码"
          value={password}
          onInput={e => setPassword(e.detail.value)}
          style={{ background: '#fff', padding: '24px', borderRadius: '8px' }}
        />
      </View>
      <Button
        loading={loading}
        onClick={onSubmit}
        style={{ marginTop: '48px', background: '#2e7d32', color: '#fff' }}
      >
        登录
      </Button>
    </View>
  );
}
