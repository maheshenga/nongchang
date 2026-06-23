import { memo } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { Batch } from '../../../api/farm';
import '../index.scss';

interface Props {
  batches: Batch[];
}

function WorkBatches({ batches }: Props) {
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
      {batches.length === 0 ? (
        <Text className="work__hint">暂无批次</Text>
      ) : (
        <ScrollView scrollX className="work__batches">
          {batches.map((b) => (
            <View className="work__batch" key={b.id} onClick={() => openBatch(b)}>
              <Text className="work__batch-no">{b.batchNo}</Text>
              <Text className="work__batch-crop">{b.cropName}</Text>
              <Text className="work__batch-meta">点击查看农事明细</Text>
              <Text className="work__batch-arrow">查看详情 ›</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default memo(WorkBatches);
