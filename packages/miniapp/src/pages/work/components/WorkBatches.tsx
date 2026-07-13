import { memo } from 'react';
import { Button, View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { Batch } from '../../../api/farm';
import DataState from '../../../components/DataState';
import type { AsyncResource } from '../../../components/DataState/model';
import '../index.scss';

interface Props {
  batches: Batch[];
  status: AsyncResource<Batch[]>['status'];
  error: string | null;
  onRetry: () => void;
}

function WorkBatches({ batches, status, error, onRetry }: Props) {
  const openBatch = (b: Batch) => {
    const q = `id=${b.id}&cropName=${encodeURIComponent(b.cropName)}&batchNo=${encodeURIComponent(b.batchNo)}`;
    Taro.navigateTo({ url: `/pages/batch/index?${q}` });
  };

  return (
    <View className="work__card">
      <View className="work__section-head">
        <Text className="work__section-title">我的批次</Text>
        <Text className="work__section-sub">{batches.length} 个在管批次</Text>
      </View>
      <DataState
        status={status}
        error={error}
        hasData={batches.length > 0}
        loadingLabel="加载批次中…"
        emptyLabel="暂无批次"
        errorTitle="批次加载失败"
        onRetry={onRetry}
        compact
      />
      {batches.length > 0 && (
        <ScrollView scrollX className="work__batches">
          {batches.map((b) => (
            <Button className="nc-button-reset work__batch" key={b.id} onClick={() => openBatch(b)}>
              <Text className="work__batch-no">{b.batchNo}</Text>
              <Text className="work__batch-crop">{b.cropName}</Text>
              <Text className="work__batch-meta">点击查看农事明细</Text>
              <Text className="work__batch-arrow">查看详情 ›</Text>
            </Button>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default memo(WorkBatches);
