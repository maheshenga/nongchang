import { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { MeProfileView } from '@nongchang/shared';
import { closeMyAccount, closeMyWechatAccount } from '../../api/account';
import { getMe } from '../../api/auth';
import { buildCloseInput, canSelfClose } from './model';
import './index.scss';

export default function CloseAccountPage() {
  const [profile, setProfile] = useState<MeProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setProfileError(null);
    try {
      setProfile(await getMe());
    } catch (e: unknown) {
      setProfile(null);
      setProfileError(e instanceof Error ? e.message : '账户资料加载失败');
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void loadProfile();
  });

  async function performClosure() {
    if (!profile) return;
    setClosing(true);
    setActionError(null);
    try {
      if (profile.deletionVerification === 'password') {
        await closeMyAccount(buildCloseInput('password', {
          password,
          appId: '',
          code: '',
        }));
      } else {
        await closeMyWechatAccount();
      }
      Taro.showToast({ title: '账号已注销', icon: 'success' });
      Taro.redirectTo({ url: '/pages/login/index' });
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : '账号注销失败');
    } finally {
      setClosing(false);
    }
  }

  function requestClosure() {
    Taro.showModal({
      title: '最后确认注销账号',
      content: '注销后无法恢复，生产、溯源、审计、支付和财务记录仍会保留。是否继续？',
      confirmText: '确认注销',
      confirmColor: '#d13438',
      success: result => {
        if (!result.confirm) return;
        void performClosure();
      },
    });
  }

  if (loading) return <View className="close-account__state">账户资料加载中…</View>;
  if (profileError || !profile) {
    return (
      <View className="close-account__state close-account__state--error">
        <Text>{profileError || '账户资料加载失败'}</Text>
        <Button className="close-account__retry" onClick={() => void loadProfile()}>
          重新加载账户
        </Button>
      </View>
    );
  }
  if (!canSelfClose(profile.role)) {
    return (
      <View className="close-account__state close-account__state--error">
        管理员账号不能自助注销，请先完成职责移交。
      </View>
    );
  }

  const ready = confirmation === '注销账号'
    && (profile.deletionVerification === 'wechat' || password.length >= 6)
    && !closing;

  return (
    <View className="close-account">
      <Text className="close-account__title">注销账号</Text>
      <Text className="close-account__warning">此操作不可恢复，请先确认数据保留范围。</Text>

      <View className="close-account__panel close-account__panel--removed">
        <Text className="close-account__panel-title">将移除</Text>
        <Text>登录用户名、显示名称、手机号、微信绑定、用户组和登录凭据。</Text>
      </View>
      <View className="close-account__panel">
        <Text className="close-account__panel-title">将保留</Text>
        <Text>生产、溯源、审计、支付、订单、额度与财务记录，以及这些记录关联的匿名账号编号。</Text>
      </View>

      <Button
        className="close-account__data"
        onClick={() => Taro.navigateTo({ url: '/pages/account-data/index' })}
      >
        先查看我的数据
      </Button>

      {profile.deletionVerification === 'password' ? (
        <>
          <Text className="close-account__label">当前密码</Text>
          <Input
            className="close-account__input"
            password
            value={password}
            placeholder="请输入当前密码"
            onInput={event => setPassword(event.detail.value)}
          />
        </>
      ) : (
        <Text className="close-account__wechat">继续后将进行一次新的微信身份验证。</Text>
      )}

      <Text className="close-account__label">输入“注销账号”确认</Text>
      <Input
        className="close-account__input"
        value={confirmation}
        placeholder="注销账号"
        onInput={event => setConfirmation(event.detail.value)}
      />
      {actionError && <Text className="close-account__error">{actionError}</Text>}
      <Button
        className="close-account__submit"
        loading={closing}
        disabled={!ready}
        onClick={requestClosure}
      >
        永久注销账号
      </Button>
    </View>
  );
}
