import { Button, Text, View } from '@tarojs/components';
import type { Batch } from '../../api/farm';
import type { SupplyItem } from '@nongchang/shared';

interface Props {
  batch: Batch;
  action: string;
  note: string;
  cost: string;
  labor: string;
  evidenceCount: number;
  location: string;
  supply: SupplyItem | undefined;
  supplyAmount: string;
  offline: boolean;
  submitting: boolean;
  onBack(): void;
  onConfirm(): void;
}

export default function RecordSubmissionReview(props: Props) {
  return (
    <View className="rec-form__review">
      <Text className="rec-form__review-title">提交前核对</Text>
      <Text className="rec-form__review-copy">确认批次、作业与凭证无误后再提交，提交失败不会清除本机草稿。</Text>
      <View className="rec-form__review-grid">
        <Text>批次：{props.batch.batchNo} · {props.batch.cropName}</Text>
        <Text>作业：{props.action}</Text>
        <Text>说明：{props.note.trim() || '未填写'}</Text>
        <Text>投入：{props.cost.trim() || '0'} 元 / {props.labor.trim() || '0'} 天</Text>
        <Text>物料：{props.supply ? `${props.supply.name} ${props.supplyAmount}${props.supply.unit}` : '未关联'}</Text>
        <Text>位置：{props.location || '未记录'}</Text>
        <Text>现场凭证：{props.evidenceCount} 张</Text>
      </View>
      {props.offline && <Text className="rec-form__review-offline">当前离线，恢复网络后才能确认提交。</Text>}
      <View className="rec-form__review-actions">
        <Button className="rec-form__review-back" disabled={props.submitting} onClick={props.onBack}>返回修改</Button>
        <Button className="rec-form__review-confirm" loading={props.submitting} onClick={props.onConfirm}>确认提交</Button>
      </View>
    </View>
  );
}
