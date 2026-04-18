import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { styles } from '../../styles';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  centered?: boolean;
};

export function SectionHeader({ title, subtitle, rightSlot, centered = false }: SectionHeaderProps) {
  return (
    <View style={styles.sectionCard}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: centered ? 'center' : 'space-between',
          alignItems: 'center'
        }}
      >
        <Text style={[styles.title, centered ? { textAlign: 'center' } : null]}>{title}</Text>
        {rightSlot ?? null}
      </View>
      {subtitle ? <Text style={[styles.subtitle, centered ? { textAlign: 'center' } : null]}>{subtitle}</Text> : null}
    </View>
  );
}
