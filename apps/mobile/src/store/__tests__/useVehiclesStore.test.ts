import { apiError, deferred, httpMock, resetHttpMock } from './httpMock';
import { useVehiclesStore, VehicleItem } from '../useVehiclesStore';

jest.mock('../../api/http', () => {
  const { httpMock: http, setAccessTokenMock } = jest.requireActual('./httpMock');
  return { httpClient: http, setAccessToken: setAccessTokenMock };
});

const vehicle = (id: string): VehicleItem => ({
  id,
  ownerId: 'owner-1',
  brand: 'Seat',
  model: 'Ibiza',
  year: 2020,
  licensePlate: `${id}-ABC`,
  description: 'Coche de prueba',
  pricePerDay: 45,
  locationLat: 38.34,
  locationLng: -0.48,
  locationAddress: 'Alicante',
  fuelType: 'gasoline',
  transmission: 'manual',
  seats: 5,
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z'
});

const input = {
  brand: 'Seat',
  model: 'Ibiza',
  year: 2020,
  licensePlate: '1234-ABC',
  description: 'Coche',
  pricePerDay: 45,
  locationLat: 38.34,
  locationLng: -0.48,
  locationAddress: 'Alicante',
  fuelType: null,
  transmission: null,
  seats: null,
  status: 'active' as const
};

beforeEach(() => {
  resetHttpMock();
  useVehiclesStore.getState().reset();
});

describe('useVehiclesStore', () => {
  it('fetchVehicles envía filtros como query params y guarda resultados', async () => {
    httpMock.get.mockResolvedValue({ data: [vehicle('v1')] });

    await useVehiclesStore.getState().fetchVehicles({ maxPrice: 50, lat: 38, lng: -0.5, radiusKm: 10 });

    expect(httpMock.get).toHaveBeenCalledWith('/vehicles', { params: { maxPrice: 50, lat: 38, lng: -0.5, radiusKm: 10 } });
    expect(useVehiclesStore.getState()).toMatchObject({ items: [vehicle('v1')], loading: false, error: null });
  });

  it('fetchVehicles descarta respuestas antiguas si llega una búsqueda más reciente', async () => {
    const slow = deferred<{ data: VehicleItem[] }>();
    const fast = deferred<{ data: VehicleItem[] }>();
    httpMock.get.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const first = useVehiclesStore.getState().fetchVehicles({ maxPrice: 100 });
    const second = useVehiclesStore.getState().fetchVehicles({ maxPrice: 30 });

    fast.resolve({ data: [vehicle('nuevo')] });
    await second;
    slow.resolve({ data: [vehicle('viejo')] });
    await first;

    expect(useVehiclesStore.getState().items.map((item) => item.id)).toEqual(['nuevo']);
    expect(useVehiclesStore.getState().loading).toBe(false);
  });

  it('fetchVehicles expone el mensaje de error de la API', async () => {
    httpMock.get.mockRejectedValue(apiError(400, ['radiusKm must not be greater than 100']));

    await useVehiclesStore.getState().fetchVehicles();

    expect(useVehiclesStore.getState()).toMatchObject({
      loading: false,
      error: 'radiusKm must not be greater than 100'
    });
  });

  it('fetchMyVehicles usa el listado propio y no toca los resultados de Explorar', async () => {
    useVehiclesStore.setState({ items: [vehicle('ajeno')] });
    httpMock.get.mockResolvedValue({ data: [vehicle('mio')] });

    await useVehiclesStore.getState().fetchMyVehicles();

    expect(httpMock.get).toHaveBeenCalledWith('/vehicles/mine/list');
    expect(useVehiclesStore.getState()).toMatchObject({
      myItems: [vehicle('mio')],
      myLoaded: true,
      myLoading: false,
      items: [vehicle('ajeno')]
    });
  });

  it('fetchMyVehicles usa el fallback si no hay mensaje', async () => {
    httpMock.get.mockRejectedValue(new Error('boom'));

    await useVehiclesStore.getState().fetchMyVehicles();

    expect(useVehiclesStore.getState().myError).toBe('No se pudieron cargar tus vehículos.');
  });

  it('createVehicle crea y recarga Mis Vehículos', async () => {
    httpMock.post.mockResolvedValue({ data: vehicle('v2') });
    httpMock.get.mockResolvedValue({ data: [vehicle('v2')] });

    await expect(useVehiclesStore.getState().createVehicle(input)).resolves.toBe(true);

    expect(httpMock.post).toHaveBeenCalledWith('/vehicles', input);
    expect(useVehiclesStore.getState()).toMatchObject({ myItems: [vehicle('v2')], myLoaded: true, creating: false });
  });

  it('createVehicle devuelve false y guarda el mensaje de conflicto', async () => {
    httpMock.post.mockRejectedValue(apiError(409, 'La matrícula ya existe'));

    await expect(useVehiclesStore.getState().createVehicle(input)).resolves.toBe(false);

    expect(useVehiclesStore.getState()).toMatchObject({ creating: false, mutationMessage: 'La matrícula ya existe' });
    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it('updateVehicleById y deleteVehicleById validan el id antes de llamar a la API', async () => {
    await expect(useVehiclesStore.getState().updateVehicleById('', input)).resolves.toBe(false);
    await expect(useVehiclesStore.getState().deleteVehicleById('')).resolves.toBe(false);

    expect(httpMock.put).not.toHaveBeenCalled();
    expect(httpMock.delete).not.toHaveBeenCalled();
    expect(useVehiclesStore.getState().mutationMessage).toBe('No hay vehículo seleccionado para eliminar.');
  });

  it('updateVehicleById actualiza y recarga', async () => {
    httpMock.put.mockResolvedValue({ data: {} });
    httpMock.get.mockResolvedValue({ data: [vehicle('v1')] });

    await expect(useVehiclesStore.getState().updateVehicleById('v1', input)).resolves.toBe(true);

    expect(httpMock.put).toHaveBeenCalledWith('/vehicles/v1', input);
    expect(useVehiclesStore.getState().myItems).toEqual([vehicle('v1')]);
  });

  it('deleteVehicleById muestra el aviso de reservas asociadas si la API no da mensaje', async () => {
    httpMock.delete.mockRejectedValue(new Error('boom'));

    await expect(useVehiclesStore.getState().deleteVehicleById('v1')).resolves.toBe(false);

    expect(useVehiclesStore.getState().mutationMessage).toMatch(/reservas asociadas/);
  });

  it('reset vuelve al estado inicial', () => {
    useVehiclesStore.setState({ items: [vehicle('x')], myItems: [vehicle('y')], myLoaded: true, error: 'e' });

    useVehiclesStore.getState().reset();

    expect(useVehiclesStore.getState()).toMatchObject({ items: [], myItems: [], myLoaded: false, error: null });
  });
});
