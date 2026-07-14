import { Button, Checkbox, CheckboxGroup, Label, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ConfiguredPublicLegal, PublicLegalQuery } from '@nongchang/shared';
import { buildLegalDocumentUrl } from './model';
import './index.scss';

interface LegalConsentProps {
  legal: ConfiguredPublicLegal | null;
  loading: boolean;
  error: string | null;
  checked: boolean;
  disabled: boolean;
  lookup: PublicLegalQuery | null;
  onChecked: (checked: boolean) => void;
  onRetry: () => void;
}

export default function LegalConsent({
  legal,
  loading,
  error,
  checked,
  disabled,
  lookup,
  onChecked,
  onRetry,
}: LegalConsentProps) {
  const checkboxDisabled = disabled || loading || Boolean(error) || !legal;

  function openDocument(kind: 'privacy' | 'agreement') {
    if (!lookup) return;
    Taro.navigateTo({ url: buildLegalDocumentUrl(kind, lookup) });
  }

  if (loading) {
    return <Text className="legal-consent__state">协议加载中，加载完成前不能登录或注册</Text>;
  }

  if (error) {
    return (
      <View className="legal-consent__state legal-consent__state--error">
        <Text>{error}</Text>
        <Button className="legal-consent__retry" disabled={disabled} onClick={onRetry}>
          重新加载协议
        </Button>
      </View>
    );
  }

  if (!legal) {
    return <Text className="legal-consent__state legal-consent__state--error">协议尚未配置，请联系管理员</Text>;
  }

  return (
    <View className="legal-consent">
      <Text className="legal-consent__version">
        隐私政策 {legal.privacyVersion} · 用户协议 {legal.agreementVersion} · 生效 {legal.effectiveDate}
      </Text>
      <View className="legal-consent__documents">
        <Button
          className="legal-consent__document"
          disabled={disabled || !lookup}
          onClick={() => openDocument('agreement')}
        >
          《用户协议》
        </Button>
        <Button
          className="legal-consent__document"
          disabled={disabled || !lookup}
          onClick={() => openDocument('privacy')}
        >
          《隐私政策》
        </Button>
      </View>
      <CheckboxGroup
        onChange={(event) => onChecked(event.detail.value.includes('authorized'))}
      >
        <Label className="legal-consent__check">
          <Checkbox value="authorized" checked={checked} disabled={checkboxDisabled} />
          <Text className="legal-consent__copy">我已阅读并同意《用户协议》和《隐私政策》</Text>
        </Label>
      </CheckboxGroup>
    </View>
  );
}
