import { memo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { QuickTemplateView } from '@nongchang/shared';
import Icon from '../../../components/Icon';
import DataState from '../../../components/DataState';
import type { AsyncResource } from '../../../components/DataState/model';
import { runWorkQuickAction, type WorkQuickAction } from '../quick-actions.model';
import '../index.scss';

interface Props {
  templates: QuickTemplateView[];
  aiBalance: number | null;
  isOffline: boolean;
  onOpenAi: (mode: 'chat' | 'diagnose') => void;
  onOpenManual: () => void;
  onOpenLocation: () => void;
  onApplyTemplate: (template: QuickTemplateView) => void;
  templateStatus: AsyncResource<QuickTemplateView[]>['status'];
  templateError: string | null;
  onRetryTemplates: () => void;
}

function WorkQuickActions({ templates, aiBalance, isOffline, onOpenAi, onOpenManual, onOpenLocation, onApplyTemplate, templateStatus, templateError, onRetryTemplates }: Props) {
  const isAiDisabled = aiBalance !== null && aiBalance <= 0;
  const run = (action: WorkQuickAction) => runWorkQuickAction(action, {
    offline: isOffline,
    aiBalance,
    openAi: onOpenAi,
    openManual: onOpenManual,
    openLocation: onOpenLocation,
    notify: title => Taro.showToast({ title, icon: 'none' }),
  });

  return (
    <>
      <DataState
        status={templateStatus}
        error={templateError}
        hasData={templates.length > 0}
        loadingLabel="加载快捷模板中…"
        errorTitle="快捷模板加载失败"
        onRetry={onRetryTemplates}
        compact
      />
      <ScrollView scrollX className="work__quick">
      <View
        className={`work__quick-item${isAiDisabled ? ' work__quick-item--disabled' : ''}`}
        onClick={() => run('chat')}
      >
        <Icon name="message-square" color="#10b981" size={28} />
        <Text className="work__quick-text">智能问答</Text>
      </View>
      <View
        className={`work__quick-item${isAiDisabled ? ' work__quick-item--disabled' : ''}`}
        onClick={() => run('diagnose')}
      >
        <Icon name="camera" color="#059669" size={28} />
        <Text className="work__quick-text">拍照诊断</Text>
      </View>
      <View className="work__quick-item" onClick={() => run('manual')}>
        <Icon name="plus" color="#0ea5e9" size={28} />
        <Text className="work__quick-text">手写农事</Text>
      </View>
      <View className="work__quick-item" onClick={() => run('location')}>
        <Icon name="trace" color="#0ea5e9" size={28} />
        <Text className="work__quick-text">地块定位</Text>
      </View>
      {templates.map((t) => (
        <View className="work__quick-item" key={t.id} onClick={() => onApplyTemplate(t)}>
          <Icon name="zap" color="#f59e0b" size={28} />
          <Text className="work__quick-text">{t.name}</Text>
        </View>
      ))}
      </ScrollView>
    </>
  );
}

export default memo(WorkQuickActions);
