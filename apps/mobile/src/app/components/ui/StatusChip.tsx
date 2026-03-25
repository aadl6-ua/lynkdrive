import { Text, View } from 'react-native';
import { styles } from '../../styles';

type StatusChipProps = {
  label: string;
};

export function StatusChip({ label }: StatusChipProps) {
  return (
    <View style={styles.chipBase}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}
