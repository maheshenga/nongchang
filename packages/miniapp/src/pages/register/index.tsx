import { useState } from 'react';
import { View, Input, Button, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getWechatRegistrationStatus, registerWechat } from '../../api/auth';
import { WX_APPID } from '../../config/env';
import Icon from '../../components/Icon';
import {
  buildRegistrationStatus,
  buildRegistrationStatusFromLookup,
  type RegistrationStatusView,
} from './status';
import './index.scss';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState<RegistrationStatusView | null>(null);

  async function onSubmit() {
    const name = displayName.trim();
    if (name.length < 2) {
      Taro.showToast({ title: '请填写姓名/名称(至少2字)', icon: 'none' });
      return;
    }
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      Taro.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (!WX_APPID) {
      Taro.showToast({ title: '未配置微信 AppID', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      const response = await registerWechat(name, phone || undefined);
      setStatus(buildRegistrationStatus(name, response));
    } catch (e: any) {
      Taro.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    if (!WX_APPID) {
      Taro.showToast({ title: '未配置微信 AppID', icon: 'none' });
      return;
    }
    setStatusLoading(true);
    try {
      const response = await getWechatRegistrationStatus();
      setStatus(buildRegistrationStatusFromLookup(response));
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '查询申请状态失败', icon: 'none' });
    } finally {
      setStatusLoading(false);
    }
  }

  return (
    <View className="register">
      <View className="register__hero">
        <View className="register__logo">
          <Icon name="leaf" color="#fff" size={36} />
        </View>
        <Text className="register__title">申请入驻</Text>
        <Text className="register__subtitle">微信授权 + 补全资料,提交后由管理员审核</Text>
      </View>

      <View className="register__card">
        {status ? (
          <View className="register__status">
            <View className="register__status-icon"><Icon name="check" color="#fff" size={32} /></View>
            <Text className="register__status-title">申请状态</Text>
            <Text className="register__status-name">申请主体：{status.displayName}</Text>
            <Text className="register__status-pill">{status.statusLabel}</Text>
            <Text className="register__status-message">申请编号：{status.applicationId}</Text>
            <Text className="register__status-next">下一步：{status.nextMessage}</Text>
            <Button className="register__lookup" loading={statusLoading} onClick={() => void refreshStatus()}>
              刷新申请状态
            </Button>
            <Button className="register__submit" onClick={() => Taro.navigateBack()}>返回登录</Button>
          </View>
        ) : (
          <>
            <Text className="register__label">姓名 / 名称</Text>
            <Input className="register__input" placeholder="请输入真实姓名或主体名称" value={displayName} onInput={(e) => setDisplayName(e.detail.value)} />
            <Text className="register__label">手机号(选填)</Text>
            <Input className="register__input" type="number" placeholder="便于审核联系,可不填" value={phone} onInput={(e) => setPhone(e.detail.value)} />
            <Button className="register__submit" loading={loading} onClick={onSubmit}>微信授权并提交</Button>
            <Button className="register__lookup" loading={statusLoading} onClick={() => void refreshStatus()}>
              查询已有申请
            </Button>
            <View className="register__back" onClick={() => Taro.navigateBack()}>
              <Text className="register__back-text">已有账号? 返回登录</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
