import { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getMe, updateMe } from '../../api/auth';
import './index.scss';

export default function ProfileEditPage() {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setLoadError(null);
    try {
      const profile = await getMe();
      setDisplayName(profile.displayName);
      setPhone(profile.phone ?? '');
    } catch (cause: unknown) {
      setLoadError(cause instanceof Error ? cause.message : '账户资料加载失败');
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void loadProfile();
  });

  async function saveProfile() {
    const normalizedName = displayName.trim();
    if (normalizedName.length < 2) {
      setMutationError('昵称至少 2 个字');
      return;
    }
    setSaving(true);
    setMutationError(null);
    try {
      await updateMe({ displayName: normalizedName, phone: phone.trim() || null });
      await Taro.showToast({ title: '资料已更新', icon: 'success' });
      await Taro.navigateBack();
    } catch (cause: unknown) {
      setMutationError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="account-form">
      <View className="account-form__intro">
        <Text className="account-form__title">修改个人资料</Text>
        <Text className="account-form__description">更新在农事记录和账户信息中显示的名称与联系电话。</Text>
      </View>

      {loading ? (
        <Text className="account-form__state">账户资料加载中…</Text>
      ) : loadError ? (
        <View>
          <Text className="account-form__error" role="alert">{loadError}</Text>
          <Button className="account-form__secondary" onClick={() => void loadProfile()}>
            重新加载账户
          </Button>
        </View>
      ) : (
        <View className="account-form__card">
          <Text className="account-form__label">昵称</Text>
          <Input
            className="account-form__input"
            value={displayName}
            placeholder="请输入昵称"
            onInput={(event) => setDisplayName(event.detail.value)}
          />
          <Text className="account-form__label">手机号</Text>
          <Input
            className="account-form__input"
            type="number"
            value={phone}
            placeholder="选填"
            onInput={(event) => setPhone(event.detail.value)}
          />
        </View>
      )}

      {mutationError && <Text className="account-form__error" role="alert">{mutationError}</Text>}
      {!loading && !loadError && (
        <Button className="account-form__submit" loading={saving} disabled={saving} onClick={() => void saveProfile()}>
          保存资料
        </Button>
      )}
    </View>
  );
}
