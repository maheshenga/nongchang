import { memo } from 'react';
import { View } from '@tarojs/components';
import '../index.scss';
import './skeleton.scss';

function WorkSkeleton() {
  return (
    <View className="work__body">
      <View className="work__card skeleton-card">
        <View className="work__section-head">
          <View className="skeleton-title" />
          <View className="skeleton-sub" />
        </View>
        <View className="skeleton-batches">
          <View className="skeleton-batch" />
          <View className="skeleton-batch" />
        </View>
      </View>

      <View className="work__card skeleton-card">
        <View className="work__section-head">
          <View className="skeleton-title" />
          <View className="skeleton-sub" />
        </View>
        <View className="skeleton-rec" />
        <View className="skeleton-rec" />
        <View className="skeleton-rec" />
      </View>
    </View>
  );
}

export default memo(WorkSkeleton);
