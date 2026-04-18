import React from 'react';
import { View, Text } from 'react-native';
import { ExploreVehiclesMapProps } from './ExploreVehiclesMap.types';

export const ExploreVehiclesMap: React.FC<ExploreVehiclesMapProps> = ({ height = 400 }) => {
  return (
    <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Mapa no disponible en esta plataforma</Text>
    </View>
  );
};
