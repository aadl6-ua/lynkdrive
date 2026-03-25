import { StyleSheet, Text, View } from 'react-native';
import { VehicleLocationMapProps } from './VehicleLocationMap.types';

export function VehicleLocationMap({ height = 260 }: VehicleLocationMapProps) {
  return (
    <View style={[styles.container, { height }]}> 
      <Text style={styles.text}>Mapa no disponible en esta plataforma.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3ee',
    backgroundColor: '#f8faff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  text: {
    color: '#536282',
    textAlign: 'center'
  }
});
