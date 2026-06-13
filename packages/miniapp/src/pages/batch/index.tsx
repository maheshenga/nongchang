import { useState } from 'react';
import { View, Text, Button, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { listFarmRecords, type FarmRecord } from '../../api/farm';

export default function Batch() {
  const router = useRouter();
  const { id, fieldId, cropName, batchNo } = router.params as Record<string, string>;
  const [records, setRecords] = useState<FarmRecord[]>([]);

  useDidShow(() => {
    listFarmRecords(id)
      .then(setRecords)
      .catch(e => Taro.showToast({ title: e.message || '加载失败', icon: 'none' }));
  });

  function addRecord() {
    Taro.navigateTo({ url: `/pages/record/index?batchId=${id}&fieldId=${fieldId}` });
  }

  return (
    <View style={{ padding: '24px', paddingBottom: '140px' }}>
      <View style={{ background: '#fff', padding: '32px', borderRadius: '8px', marginBottom: '24px' }}>
        <Text style={{ fontSize: '32px', fontWeight: 'bold' }}>{decodeURIComponent(cropName || '')}</Text>
        <View style={{ marginTop: '8px' }}>
          <Text style={{ color: '#666', fontSize: '26px' }}>批次 {decodeURIComponent(batchNo || '')}</Text>
        </View>
      </View>

      <Text style={{ fontSize: '28px', color: '#333' }}>农事记录</Text>
      {records.length === 0 && (
        <View style={{ marginTop: '16px' }}><Text style={{ color: '#999' }}>暂无记录</Text></View>
      )}
      {records.map(r => (
        <View key={r.id} style={{ background: '#fff', padding: '28px', borderRadius: '8px', marginTop: '16px' }}>
          <Text style={{ fontWeight: 'bold' }}>{r.action}</Text>
          <View style={{ marginTop: '8px' }}>
            <Text style={{ color: '#666', fontSize: '24px' }}>{r.recordedAt}</Text>
          </View>
          {r.detail?.note ? (
            <View style={{ marginTop: '8px' }}><Text style={{ fontSize: '26px' }}>{String(r.detail.note)}</Text></View>
          ) : null}
          {(r.images || []).map(url => (
            <Image key={url} src={url} mode="widthFix" style={{ width: '200px', marginTop: '12px', borderRadius: '6px' }} />
          ))}
        </View>
      ))}

      <View style={{ position: 'fixed', left: '24px', right: '24px', bottom: '32px' }}>
        <Button onClick={addRecord} style={{ background: '#2e7d32', color: '#fff' }}>记一笔</Button>
      </View>
    </View>
  );
}
