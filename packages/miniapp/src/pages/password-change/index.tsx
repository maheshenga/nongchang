import { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { changePassword } from '../../api/auth';
import './index.scss';

export default function PasswordChangePage() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePassword() {
    if (oldPassword.length < 6) {
      setError('请输入正确的原密码');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmation) {
      setError('两次新密码不一致');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await changePassword(oldPassword, newPassword);
      await Taro.showToast({ title: '密码已修改', icon: 'success' });
      await Taro.navigateBack();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '修改失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="account-form">
      <View className="account-form__intro">
        <Text className="account-form__title">修改登录密码</Text>
        <Text className="account-form__description">请使用至少 6 位的新密码，并妥善保管账户凭据。</Text>
      </View>

      <View className="account-form__card">
        <Text className="account-form__label">原密码</Text>
        <Input className="account-form__input" password value={oldPassword} placeholder="请输入原密码" onInput={(event) => setOldPassword(event.detail.value)} />
        <Text className="account-form__label">新密码</Text>
        <Input className="account-form__input" password value={newPassword} placeholder="至少 6 位" onInput={(event) => setNewPassword(event.detail.value)} />
        <Text className="account-form__label">确认新密码</Text>
        <Input className="account-form__input" password value={confirmation} placeholder="再次输入新密码" onInput={(event) => setConfirmation(event.detail.value)} />
      </View>

      {error && <Text className="account-form__error" role="alert">{error}</Text>}
      <Button className="account-form__submit" loading={saving} disabled={saving} onClick={() => void savePassword()}>
        确认修改
      </Button>
    </View>
  );
}
