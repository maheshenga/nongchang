import { useCallback, useEffect, useState } from 'react';
import { View, Input, Button, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ConfiguredPublicLegal, PublicLegalQuery } from '@nongchang/shared';
import { getWechatRegistrationStatus, registerWechat } from '../../api/auth';
import { getPublicLegal } from '../../api/legal';
import { WX_APPID } from '../../config/env';
import Icon from '../../components/Icon';
import LegalConsent from '../../components/LegalConsent';
import {
  buildRegistrationStatus,
  buildRegistrationStatusFromLookup,
  type RegistrationStatusView,
} from './status';
import './index.scss';

const REGISTRATION_LEGAL_LOOKUP: PublicLegalQuery | null = WX_APPID ? { appId: WX_APPID } : null;

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState<RegistrationStatusView | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [legal, setLegal] = useState<ConfiguredPublicLegal | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);

  const loadLegal = useCallback(async () => {
    setAuthorized(false);
    setLegal(null);
    if (!REGISTRATION_LEGAL_LOOKUP) {
      setLegalError('未配置微信 AppID');
      return;
    }
    setLegalLoading(true);
    setLegalError(null);
    try {
      const response = await getPublicLegal(REGISTRATION_LEGAL_LOOKUP);
      if (response.configured) setLegal(response);
    } catch (e: unknown) {
      setLegalError(e instanceof Error ? e.message : '协议加载失败');
    } finally {
      setLegalLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLegal();
  }, [loadLegal]);

  function isPublicationConflict(e: unknown): boolean {
    return typeof e === 'object' && e !== null && 'status' in e
      && (e as { status?: unknown }).status === 409;
  }

  async function onSubmit() {
    const name = displayName.trim();
    if (name.length < 2) {
      Taro.showToast({ title: '请填写姓名/名称（至少2字）', icon: 'none' });
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
    if (!legal || !authorized || legalLoading || legalError) {
      Taro.showToast({ title: '请先加载并同意当前用户协议和隐私政策', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      const response = await registerWechat(name, legal.publicationId, phone || undefined);
      setStatus(buildRegistrationStatus(name, response));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '提交失败';
      if (isPublicationConflict(e)) await loadLegal();
      Taro.showToast({ title: message, icon: 'none' });
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
    } catch (e: unknown) {
      Taro.showToast({
        title: e instanceof Error ? e.message : '查询申请状态失败',
        icon: 'none',
      });
    } finally {
      setStatusLoading(false);
    }
  }

  const canSubmit = Boolean(
    legal && authorized && !legalLoading && !legalError && !loading && !statusLoading,
  );

  return (
    <View className="register">
      <View className="register__hero">
        <View className="register__logo">
          <Icon name="leaf" color="#fff" size={36} />
        </View>
        <Text className="register__title">申请入驻</Text>
        <Text className="register__subtitle">微信授权 + 补全资料，提交后由管理员审核</Text>
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
            <Input
              className="register__input"
              placeholder="请输入真实姓名或主体名称"
              value={displayName}
              onInput={event => setDisplayName(event.detail.value)}
            />
            <Text className="register__label">手机号（选填）</Text>
            <Input
              className="register__input"
              type="number"
              placeholder="便于审核联系，可不填"
              value={phone}
              onInput={event => setPhone(event.detail.value)}
            />
            <LegalConsent
              legal={legal}
              loading={legalLoading}
              error={legalError}
              checked={authorized}
              disabled={loading || statusLoading}
              lookup={REGISTRATION_LEGAL_LOOKUP}
              onChecked={setAuthorized}
              onRetry={() => void loadLegal()}
            />
            <Button
              className="register__submit"
              loading={loading}
              disabled={!canSubmit}
              onClick={() => void onSubmit()}
            >
              微信授权并提交
            </Button>
            <Button className="register__lookup" loading={statusLoading} onClick={() => void refreshStatus()}>
              查询已有申请
            </Button>
            <Button className="nc-button-reset register__back" onClick={() => Taro.navigateBack()}>
              <Text className="register__back-text">已有账号？返回登录</Text>
            </Button>
          </>
        )}
      </View>
    </View>
  );
}
