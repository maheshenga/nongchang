import { Button, Text, View } from '@tarojs/components';
import type { AsyncResource } from './model';
import './index.scss';

interface Props {
  status: AsyncResource<unknown>['status'];
  error: string | null;
  hasData: boolean;
  loadingLabel: string;
  emptyLabel?: string;
  errorTitle: string;
  onRetry: () => void;
  compact?: boolean;
}

export default function DataState({
  status,
  error,
  hasData,
  loadingLabel,
  emptyLabel,
  errorTitle,
  onRetry,
  compact = false,
}: Props) {
  if (status === 'error') {
    return (
      <View className={`data-state data-state--error${compact ? ' data-state--compact' : ''}`} role="alert">
        <View className="data-state__copy">
          <Text className="data-state__title">{errorTitle}</Text>
          <Text className="data-state__detail">{error || '请稍后重试'}</Text>
        </View>
        <Button className="data-state__retry" onClick={onRetry}>重试</Button>
      </View>
    );
  }
  if (status === 'loading') {
    return (
      <View className={`data-state${compact ? ' data-state--compact' : ''}`} role="status">
        <Text className="data-state__detail">{hasData ? '刷新中…' : loadingLabel}</Text>
      </View>
    );
  }
  if (status === 'success' && !hasData && emptyLabel) {
    return (
      <View className={`data-state${compact ? ' data-state--compact' : ''}`}>
        <Text className="data-state__detail">{emptyLabel}</Text>
      </View>
    );
  }
  return null;
}
