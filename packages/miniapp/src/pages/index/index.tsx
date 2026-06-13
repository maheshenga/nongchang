import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { listBatches, type Batch } from '../../api/farm';
import { getToken } from '../../store/auth';

export default function Index() {
  const [batches, setBatches] = useState<Batch[]>([]);

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    listBatches()
      .then(setBatches)
      .catch(e => Taro.showToast({ title: e.message || '加载失败', icon: 'none' }));
  });

  function openBatch(b: Batch) {
    Taro.navigateTo({
      url: `/pages/batch/index?id=${b.id}&fieldId=${b.fieldId}&cropName=${encodeURIComponent(b.cropName)}&batchNo=${encodeURIComponent(b.batchNo)}`,
    });
  }

  return (
    <View style={{ padding: '24px' }}>
      {batches.length === 0 && (
        <Text style={{ color: '#999' }}>暂无批次</Text>
      )}
      {batches.map(b => (
        <View
          key={b.id}
          onClick={() => openBatch(b)}
          style={{ background: '#fff', padding: '32px', borderRadius: '8px', marginBottom: '20px' }}
        >
          <Text style={{ fontSize: '32px', fontWeight: 'bold' }}>{b.cropName}</Text>
          <View style={{ marginTop: '12px' }}>
            <Text style={{ color: '#666', fontSize: '26px' }}>批次 {b.batchNo} · {b.status}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
