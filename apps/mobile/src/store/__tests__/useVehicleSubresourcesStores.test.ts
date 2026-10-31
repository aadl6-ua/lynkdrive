import { apiError, deferred, httpMock, resetHttpMock } from './httpMock';
import { useVehicleAvailabilityWindowsStore } from '../useVehicleAvailabilityWindowsStore';
import { useVehicleImagesStore } from '../useVehicleImagesStore';

jest.mock('../../api/http', () => {
  const { httpMock: http, setAccessTokenMock } = jest.requireActual('./httpMock');
  return { httpClient: http, setAccessToken: setAccessTokenMock };
});

const image = (id: string, vehicleId = 'v1') => ({
  id,
  vehicleId,
  imageUrl: `supabase://vehicles/${id}.jpg`,
  isPrimary: false,
  createdAt: '2026-07-01T00:00:00.000Z'
});

const slot = (id: string, vehicleId = 'v1') => ({
  id,
  vehicleId,
  startDatetime: '2026-07-10T08:00:00.000Z',
  endDatetime: '2026-07-12T20:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z'
});

beforeEach(() => {
  resetHttpMock();
  useVehicleImagesStore.setState({ items: [], vehicleId: null, loading: false, saving: false, error: null, mutationMessage: null });
  useVehicleAvailabilityWindowsStore.setState({
    items: [],
    vehicleId: null,
    loading: false,
    saving: false,
    error: null,
    mutationMessage: null
  });
});

describe('useVehicleImagesStore', () => {
  it('carga imágenes por vehículo', async () => {
    httpMock.get.mockResolvedValue({ data: [image('i1')] });

    await useVehicleImagesStore.getState().fetchByVehicleId('v1');

    expect(httpMock.get).toHaveBeenCalledWith('/vehicle-images', { params: { vehicleId: 'v1' } });
    expect(useVehicleImagesStore.getState()).toMatchObject({ items: [image('i1')], vehicleId: 'v1', loading: false });
  });

  it('al cambiar de vehículo vacía la lista e ignora la respuesta del anterior', async () => {
    useVehicleImagesStore.setState({ items: [image('i1')], vehicleId: 'v1' });
    const oldRequest = deferred<{ data: unknown[] }>();
    httpMock.get.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce({ data: [image('i2', 'v2')] });

    const first = useVehicleImagesStore.getState().fetchByVehicleId('v1');
    expect(useVehicleImagesStore.getState().items).toEqual([image('i1')]);

    await useVehicleImagesStore.getState().fetchByVehicleId('v2');
    oldRequest.resolve({ data: [image('i1')] });
    await first;

    expect(useVehicleImagesStore.getState()).toMatchObject({ vehicleId: 'v2', items: [image('i2', 'v2')] });
  });

  it('sin vehículo limpia el estado sin llamar a la API', async () => {
    useVehicleImagesStore.setState({ items: [image('i1')] });

    await useVehicleImagesStore.getState().fetchByVehicleId('');

    expect(httpMock.get).not.toHaveBeenCalled();
    expect(useVehicleImagesStore.getState().items).toEqual([]);
  });

  it('createForVehicle recorta la URL y recarga', async () => {
    httpMock.post.mockResolvedValue({ data: {} });
    httpMock.get.mockResolvedValue({ data: [image('i1')] });

    await expect(useVehicleImagesStore.getState().createForVehicle('v1', '  supabase://vehicles/i1.jpg ', true)).resolves.toBe(
      true
    );

    expect(httpMock.post).toHaveBeenCalledWith('/vehicle-images', {
      vehicleId: 'v1',
      imageUrl: 'supabase://vehicles/i1.jpg',
      isPrimary: true
    });
    expect(useVehicleImagesStore.getState()).toMatchObject({ items: [image('i1')], saving: false });
  });

  it('createForVehicle valida entrada vacía', async () => {
    await expect(useVehicleImagesStore.getState().createForVehicle('v1', '   ', false)).resolves.toBe(false);
    expect(httpMock.post).not.toHaveBeenCalled();
  });

  it('updateById y deleteById propagan errores de la API', async () => {
    httpMock.put.mockRejectedValue(apiError(403, 'No eres el propietario'));
    await expect(useVehicleImagesStore.getState().updateById('i1', 'v1', { isPrimary: true })).resolves.toBe(false);
    expect(httpMock.put).toHaveBeenCalledWith('/vehicle-images/i1', { isPrimary: true });
    expect(useVehicleImagesStore.getState().mutationMessage).toBe('No eres el propietario');

    httpMock.delete.mockResolvedValue({ data: {} });
    httpMock.get.mockResolvedValue({ data: [] });
    await expect(useVehicleImagesStore.getState().deleteById('i1', 'v1')).resolves.toBe(true);
    expect(httpMock.delete).toHaveBeenCalledWith('/vehicle-images/i1');
  });
});

describe('useVehicleAvailabilityWindowsStore', () => {
  it('crea ventanas con fechas ISO recortadas y recarga', async () => {
    httpMock.post.mockResolvedValue({ data: {} });
    httpMock.get.mockResolvedValue({ data: [slot('w1')] });

    await expect(
      useVehicleAvailabilityWindowsStore
        .getState()
        .createForVehicle('v1', ' 2026-07-10T08:00:00.000Z ', '2026-07-12T20:00:00.000Z ')
    ).resolves.toBe(true);

    expect(httpMock.post).toHaveBeenCalledWith('/vehicle-availability-windows', {
      vehicleId: 'v1',
      startDatetime: '2026-07-10T08:00:00.000Z',
      endDatetime: '2026-07-12T20:00:00.000Z'
    });
    expect(httpMock.get).toHaveBeenCalledWith('/vehicle-availability-windows', { params: { vehicleId: 'v1' } });
    expect(useVehicleAvailabilityWindowsStore.getState().items).toEqual([slot('w1')]);
  });

  it('valida campos obligatorios antes de llamar a la API', async () => {
    const store = useVehicleAvailabilityWindowsStore.getState();
    await expect(store.createForVehicle('v1', '', 'x')).resolves.toBe(false);
    await expect(store.updateById('', 'v1', 'a', 'b')).resolves.toBe(false);
    await expect(store.deleteById('w1', '')).resolves.toBe(false);
    expect(httpMock.post).not.toHaveBeenCalled();
    expect(httpMock.put).not.toHaveBeenCalled();
    expect(httpMock.delete).not.toHaveBeenCalled();
  });

  it('updateById envía solo las fechas y gestiona errores', async () => {
    httpMock.put.mockRejectedValue(apiError(400, 'endDatetime must be after startDatetime'));

    await expect(
      useVehicleAvailabilityWindowsStore.getState().updateById('w1', 'v1', '2026-07-12T00:00:00Z', '2026-07-10T00:00:00Z')
    ).resolves.toBe(false);

    expect(httpMock.put).toHaveBeenCalledWith('/vehicle-availability-windows/w1', {
      startDatetime: '2026-07-12T00:00:00Z',
      endDatetime: '2026-07-10T00:00:00Z'
    });
    expect(useVehicleAvailabilityWindowsStore.getState()).toMatchObject({
      saving: false,
      mutationMessage: 'endDatetime must be after startDatetime'
    });
  });

  it('fetchByVehicleId guarda el error de carga', async () => {
    httpMock.get.mockRejectedValue(new Error('boom'));

    await useVehicleAvailabilityWindowsStore.getState().fetchByVehicleId('v1');

    expect(useVehicleAvailabilityWindowsStore.getState()).toMatchObject({
      loading: false,
      error: 'No se pudieron cargar las ventanas de disponibilidad.'
    });
  });
});
