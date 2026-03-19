import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { styles } from '../../styles';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export function SectionHeader({ title, subtitle, rightSlot }: SectionHeaderProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.title}>{title}</Text>
        {rightSlot ?? null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
