import { Button, Text, View } from '@tarojs/components';
import type { RecordReceiptView } from './draft';

export default function RecordReceipt({ receipt, onView, onAnother }: {
  receipt: RecordReceiptView;
  onView(): void;
  onAnother(): void;
}) {
  return (
    <View className="rec-form__receipt">
      <Text className="rec-form__receipt-eyebrow">提交成功</Text>
      <Text className="rec-form__receipt-title">农事记录已保存</Text>
      <Text className="rec-form__receipt-copy">{receipt.batchNo} · {receipt.cropName} · {receipt.action}</Text>
      <Text className="rec-form__receipt-id">记录编号 {receipt.recordId}</Text>
      <View className="rec-form__receipt-actions">
        <Button className="rec-form__review-confirm" onClick={onView}>查看记录</Button>
        <Button className="rec-form__review-back" onClick={onAnother}>再记一笔</Button>
      </View>
    </View>
  );
}
