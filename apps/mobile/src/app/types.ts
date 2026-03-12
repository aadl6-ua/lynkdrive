export type AppTabKey = 'explore' | 'trips' | 'myVehicles' | 'profile';

export const APP_TABS: Array<{ key: AppTabKey; label: string }> = [
  { key: 'explore', label: 'Explorar' },
  { key: 'trips', label: 'Mis Viajes' },
  { key: 'myVehicles', label: 'Mis Vehiculos' },
  { key: 'profile', label: 'Perfil' }
];
