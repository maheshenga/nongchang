import { useEffect, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import type { ConfiguredPublicLegal, PublicLegalQuery } from '@nongchang/shared';
import { getPublicLegal } from '../../api/legal';
import './index.scss';

type LegalKind = 'privacy' | 'agreement';

export default function LegalDocument() {
  const { params } = useRouter();
  const kind: LegalKind | null = params.type === 'privacy' || params.type === 'agreement'
    ? params.type
    : null;
  const tenantCode = params.tenantCode || '';
  const appId = params.appId || '';
  const [legal, setLegal] = useState<ConfiguredPublicLegal | null>(null);
  const [loading, setLoading] = useState(Boolean(kind && (tenantCode || appId)));
  const [error, setError] = useState<string | null>(null);

  async function loadLegal() {
    if (!kind || (!tenantCode && !appId)) return;
    const lookup: PublicLegalQuery = {
      ...(tenantCode ? { tenantCode } : {}),
      ...(appId ? { appId } : {}),
    };
    setLoading(true);
    setError(null);
    try {
      const response = await getPublicLegal(lookup);
      setLegal(response.configured ? response : null);
    } catch (e: unknown) {
      setLegal(null);
      setError(e instanceof Error ? e.message : '协议加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLegal();
    // Router query values are immutable for this page instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, tenantCode, appId]);

  if (!kind) {
    return <View className="legal-page__state legal-page__state--error">文档类型无效</View>;
  }
  if (!tenantCode && !appId) {
    return <View className="legal-page__state legal-page__state--error">协议加载失败：缺少查询参数</View>;
  }
  if (loading) {
    return <View className="legal-page__state">协议加载中…</View>;
  }
  if (error) {
    return (
      <View className="legal-page__state legal-page__state--error">
        <Text>协议加载失败：{error}</Text>
        <Button className="legal-page__retry" onClick={() => void loadLegal()}>重新加载</Button>
      </View>
    );
  }
  if (!legal) {
    return <View className="legal-page__state legal-page__state--error">协议尚未配置，请联系管理员</View>;
  }

  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? '隐私政策' : '用户协议';
  const version = isPrivacy ? legal.privacyVersion : legal.agreementVersion;
  const body = isPrivacy ? legal.privacyPolicyText : legal.userAgreementText;

  return (
    <View className="legal-page">
      <Text className="legal-page__title">{title}</Text>
      <Text className="legal-page__operator">运营主体：{legal.operatorName}</Text>
      <Text className="legal-page__meta">版本：{version} · 生效日期：{legal.effectiveDate}</Text>
      <Text className="legal-page__body" userSelect>{body}</Text>
      <View className="legal-page__contact">
        <Text className="legal-page__contact-title">隐私与协议联系信息</Text>
        <Text>联系人员：{legal.privacyContact}</Text>
        <Text>联系地址：{legal.contactAddress}</Text>
        {legal.contactPhone && <Text>联系电话：{legal.contactPhone}</Text>}
        {legal.contactEmail && <Text>联系邮箱：{legal.contactEmail}</Text>}
      </View>
    </View>
  );
}
