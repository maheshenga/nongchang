import { useState } from 'react';
import { View, Text, Textarea, Button, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { createFarmRecord, uploadImage } from '../../api/farm';
import { FARM_ACTIONS } from '../../constants/actions';
import { FarmRecordSource } from '@nongchang/shared';

export default function Record() {
  const router = useRouter();
  const { batchId, fieldId } = router.params as Record<string, string>;
  const [action, setAction] = useState<string>('');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function chooseAndUpload() {
    const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
    const filePath = r.tempFilePaths[0];
    try {
      const url = await uploadImage(filePath);
      setImages(prev => [...prev, url]);
    } catch (e: any) {
      Taro.showToast({ title: e.message || '上传失败', icon: 'none' });
    }
  }

  async function submit() {
    if (!action) {
      Taro.showToast({ title: '请选择农事动作', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await createFarmRecord({
        batchId,
        fieldId,
        action,
        detail: note ? { note } : undefined,
        images: images.length ? images : undefined,
        recordedAt: new Date().toISOString(),
        source: FarmRecordSource.MINIAPP,
      });
      Taro.showToast({ title: '已保存', icon: 'success' });
      Taro.navigateBack();
    } catch (e: any) {
      Taro.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ padding: '24px' }}>
      <Text style={{ fontSize: '28px' }}>农事动作</Text>
      <View style={{ display: 'flex', flexWrap: 'wrap', marginTop: '16px' }}>
        {FARM_ACTIONS.map(a => (
          <View
            key={a}
            onClick={() => setAction(a)}
            style={{
              padding: '16px 28px', marginRight: '16px', marginBottom: '16px', borderRadius: '32px',
              background: action === a ? '#2e7d32' : '#fff',
              color: action === a ? '#fff' : '#333',
            }}
          >
            <Text>{a}</Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: '28px' }}>备注</Text>
      <Textarea
        value={note}
        onInput={e => setNote(e.detail.value)}
        placeholder="可填写补充说明(可选)"
        style={{ background: '#fff', padding: '24px', borderRadius: '8px', marginTop: '16px', width: '100%', height: '160px' }}
      />

      <Text style={{ fontSize: '28px', display: 'block', marginTop: '24px' }}>照片</Text>
      <View style={{ display: 'flex', flexWrap: 'wrap', marginTop: '16px' }}>
        {images.map(url => (
          <Image key={url} src={url} mode="aspectFill" style={{ width: '160px', height: '160px', marginRight: '16px', borderRadius: '6px' }} />
        ))}
        <View
          onClick={chooseAndUpload}
          style={{ width: '160px', height: '160px', background: '#fff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#2e7d32', fontSize: '48px' }}>+</Text>
        </View>
      </View>

      <Button loading={submitting} onClick={submit} style={{ marginTop: '48px', background: '#2e7d32', color: '#fff' }}>
        保存记录
      </Button>
    </View>
  );
}
