import { Button, Text, View } from '@tarojs/components';
import type { PublicLegalQuery } from '@nongchang/shared';
import { canSelfClose } from '../close-account/model';

interface Props {
  roleCode: string | null;
  legalLookup: PublicLegalQuery | null;
  onOpenData: () => void;
  onOpenLegal: (kind: 'privacy' | 'agreement') => void;
  onOpenClosure: () => void;
}

export default function MeLegalAccountSection({
  roleCode,
  legalLookup,
  onOpenData,
  onOpenLegal,
  onOpenClosure,
}: Props) {
  return (
    <View className="me__menu-section">
      <Text className="me__section-title">数据与隐私</Text>
      <Button className="nc-button-reset me__item" onClick={onOpenData}>
        <Text className="me__item-text">我的数据</Text>
        <Text className="me__item-arrow">›</Text>
      </Button>
      <Button
        className="nc-button-reset me__item"
        disabled={!legalLookup}
        onClick={() => onOpenLegal('privacy')}
      >
        <Text className="me__item-text">隐私政策</Text>
        <Text className="me__item-arrow">›</Text>
      </Button>
      <Button
        className="nc-button-reset me__item"
        disabled={!legalLookup}
        onClick={() => onOpenLegal('agreement')}
      >
        <Text className="me__item-text">用户协议</Text>
        <Text className="me__item-arrow">›</Text>
      </Button>
      {canSelfClose(roleCode) && (
        <Button className="nc-button-reset me__item me__item--danger" onClick={onOpenClosure}>
          <Text className="me__item-text">注销账号</Text>
          <Text className="me__item-arrow">›</Text>
        </Button>
      )}
    </View>
  );
}
