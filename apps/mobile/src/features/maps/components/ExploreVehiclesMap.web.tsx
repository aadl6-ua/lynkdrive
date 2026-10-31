import React from 'react';
import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  CircleMarker,
  Popup,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { colorTokens, fontFamilies } from '../../../app/theme/tokens';
import { formatPriceCompact } from '../../../shared/format';
import { ExploreVehiclesMapProps } from './ExploreVehiclesMap.types';

// Type wrappers para evitar errores de TypeScript
const MapContainer = LeafletMapContainer as any;
const TileLayer = LeafletTileLayer as any;
const WebCircleMarker = CircleMarker as any;

const DEFAULT_CENTER = { latitude: 40.4168, longitude: -3.7038 };

export const ExploreVehiclesMap: React.FC<ExploreVehiclesMapProps> = ({
  vehicles,
  userLocation,
  onVehiclePress,
  height = 400,
  infoBottomInset = 0,
}) => {
  void infoBottomInset;
  // Calcular centro del mapa
  // Sin ubicación ni vehículos centramos en Madrid para no mostrar un mapa vacío.
  const centerLocation = userLocation || (vehicles.length > 0 ? vehicles[0].location : DEFAULT_CENTER);

  return (
    <MapContainer
      center={[centerLocation.latitude, centerLocation.longitude]}
      zoom={13}
      zoomControl={false}
      style={{ height: `${height}px`, width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Marcador del usuario */}
      {userLocation && (
        <WebCircleMarker
          center={[userLocation.latitude, userLocation.longitude]}
          radius={10}
          pathOptions={{ color: colorTokens.accent2, fillColor: colorTokens.accent2, fillOpacity: 0.95, weight: 2 }}
        >
          <Popup>
            <div style={{ textAlign: 'center' }}>
              <strong>Tu ubicación</strong>
            </div>
          </Popup>
        </WebCircleMarker>
      )}

      {/* Marcadores de vehículos */}
      {vehicles.map((vehicle) => (
        <WebCircleMarker
          key={vehicle.id}
          center={[vehicle.location.latitude, vehicle.location.longitude]}
          radius={9}
          pathOptions={{ color: colorTokens.secondary, fillColor: colorTokens.primary, fillOpacity: 0.95, weight: 2 }}
        >
          <Popup>
            <div
              style={{
                width: '200px',
                textAlign: 'center',
                cursor: 'default',
                fontFamily: fontFamilies.body,
              }}
            >
              {vehicle.imageUrl ? (
                <img
                  src={vehicle.imageUrl}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  style={{
                    width: '100%',
                    height: '120px',
                    objectFit: 'cover',
                    borderRadius: '10px',
                    marginBottom: '8px',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '120px',
                    backgroundColor: '#e0e0e0',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px',
                    color: '#999',
                    fontSize: '12px',
                  }}
                >
                  Sin imagen
                </div>
              )}
              <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                {vehicle.brand} {vehicle.model}
              </div>
              <div style={{ fontSize: '12px', color: '#333' }}>
                {formatPriceCompact(vehicle.pricePerDay)} / día
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onVehiclePress) {
                    onVehiclePress(vehicle.id);
                  }
                }}
                style={{
                  marginTop: '8px',
                  border: `1px solid ${colorTokens.primary}`,
                  backgroundColor: colorTokens.primary,
                  color: colorTokens.white,
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  fontFamily: fontFamilies.bodyBold,
                  width: '100%',
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                Ver detalle
              </button>
            </div>
          </Popup>
        </WebCircleMarker>
      ))}
    </MapContainer>
  );
};
