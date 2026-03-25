import { Text, View } from 'react-native';
import { styles } from '../../styles';

type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.switcherTitle}>{title}</Text>
      {description ? <Text style={styles.subtitle}>{description}</Text> : null}
    </View>
  );
}
