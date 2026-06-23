import { memo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { QuickTemplateView } from '@nongchang/shared';
import Icon from '../../../components/Icon';
import '../index.scss';

interface Props {
  templates: QuickTemplateView[];
  aiBalance: number | null;
  onOpenAi: (mode: 'chat' | 'diagnose') => void;
  onOpenForm: (tpl: QuickTemplateView | null) => void;
}

function WorkQuickActions({ templates, aiBalance, onOpenAi, onOpenForm }: Props) {
  const isAiDisabled = aiBalance !== null && aiBalance <= 0;

  return (
    <ScrollView scrollX className="work__quick">
      <View
        className={`work__quick-item${isAiDisabled ? ' work__quick-item--disabled' : ''}`}
        onClick={() => {
          if (isAiDisabled) {
            Taro.showToast({ title: 'AI 算力不足,请联系代理商充值', icon: 'none' });
            return;
          }
          onOpenAi('chat');
        }}
      >
        <Icon name="message-square" color="#10b981" size={28} />
        <Text className="work__quick-text">智能问答</Text>
      </View>
      <View
        className={`work__quick-item${isAiDisabled ? ' work__quick-item--disabled' : ''}`}
        onClick={() => {
          if (isAiDisabled) {
            Taro.showToast({ title: 'AI 算力不足,请联系代理商充值', icon: 'none' });
            return;
          }
          onOpenAi('diagnose');
        }}
      >
        <Icon name="camera" color="#059669" size={28} />
        <Text className="work__quick-text">拍照诊断</Text>
      </View>
      <View className="work__quick-item" onClick={() => onOpenForm(null)}>
        <Icon name="plus" color="#0ea5e9" size={28} />
        <Text className="work__quick-text">手写农事</Text>
      </View>
      <View className="work__quick-item work__quick-item--reserved" onClick={() => Taro.showToast({ title: '区块链定位即将开放', icon: 'none' })}>
        <Icon name="trace" color="#94a3b8" size={28} />
        <Text className="work__quick-text">区块链定位</Text>
      </View>
      {templates.map((t) => (
        <View className="work__quick-item" key={t.id} onClick={() => onOpenForm(t)}>
          <Icon name="zap" color="#f59e0b" size={28} />
          <Text className="work__quick-text">{t.name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default memo(WorkQuickActions);
