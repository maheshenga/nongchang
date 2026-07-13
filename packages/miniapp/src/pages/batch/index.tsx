import { useState } from 'react';
import { Button, View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { listFarmRecords, type FarmRecord } from '../../api/farm';
import { writePendingRecordIntent } from '../work/record-intent';
import './index.scss';

export default function Batch() {
  const router = useRouter();
  const { id, cropName, batchNo } = router.params as Record<string, string>;
  const [records, setRecords] = useState<FarmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const decodedCropName = decodeURIComponent(cropName || '');
  const decodedBatchNo = decodeURIComponent(batchNo || '');

  useDidShow(() => {
    setLoading(true);
    setErr(null);
    listFarmRecords(id)
      .then(setRecords)
      .catch((e: any) => setErr(e?.message || '加载失败'))
      .finally(() => setLoading(false));
  });

  function addRecord() {
    if (!id || !decodedBatchNo || !decodedCropName) {
      Taro.showToast({ title: '批次信息不完整，无法记一笔', icon: 'none' });
      return;
    }
    writePendingRecordIntent({ id, batchNo: decodedBatchNo, cropName: decodedCropName });
    Taro.switchTab({ url: '/pages/work/index' });
  }

  return (
    <View className="batch">
      <View className="batch__header">
        <Text className="batch__crop">{decodedCropName}</Text>
        <Text className="batch__no">批次 {decodedBatchNo}</Text>
      </View>

      <View className="batch__body">
        <Text className="batch__section-title">农事记录</Text>
        {loading && <Text className="batch__hint">加载中…</Text>}
        {err && <Text className="batch__hint batch__hint--err">{err}</Text>}
        {!loading && !err && records.length === 0 && (
          <Text className="batch__hint">暂无记录</Text>
        )}
        {records.map((r) => (
          <View className="batch__rec" key={r.id}>
            <View className="batch__rec-top">
              <Text className="batch__rec-action">{r.action}</Text>
              <Text className="batch__rec-time">{r.recordedAt?.slice(0, 16).replace('T', ' ')}</Text>
            </View>
            {r.detail?.note ? (
              <Text className="batch__rec-note">{String(r.detail.note)}</Text>
            ) : null}
            {(r.images || []).map((url) => (
              <Image key={url} className="batch__rec-img" src={url} mode="widthFix" />
            ))}
          </View>
        ))}
      </View>

      <Button className="nc-button-reset batch__fab" onClick={addRecord}>
        <Text className="batch__fab-text">记一笔</Text>
      </Button>
    </View>
  );
}
