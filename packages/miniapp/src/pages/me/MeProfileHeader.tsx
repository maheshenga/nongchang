import { Button, Text, View } from '@tarojs/components';

interface Props {
  displayName: string;
  username: string;
  role: string;
  phone: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function MeProfileHeader({
  displayName,
  username,
  role,
  phone,
  loading,
  error,
  onRetry,
}: Props) {
  const accountName = loading ? '账户加载中' : displayName || username;
  const roleText = loading ? '身份加载中' : `${role}${phone ? ` · ${phone}` : ''}`;

  return (
    <>
      <View className="me__header">
        <View className="me__avatar">
          <Text className="me__avatar-text">{(loading ? '账' : displayName || username).slice(0, 1)}</Text>
        </View>
        <View>
          <Text className="me__eyebrow">当前账号</Text>
          <Text className="me__name">{accountName}</Text>
          <Text className="me__role">{roleText}</Text>
        </View>
      </View>

      {error && (
        <View className="me__profile-error" role="alert">
          <Text className="me__profile-error-text">{error}</Text>
          <Button className="me__profile-retry" loading={loading} onClick={onRetry}>
            重新加载账户
          </Button>
        </View>
      )}
    </>
  );
}
