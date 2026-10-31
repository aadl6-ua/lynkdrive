import { apiError, httpMock, resetHttpMock } from './httpMock';
import { UserProfile, useUserProfileStore } from '../useUserProfileStore';

jest.mock('../../api/http', () => {
  const { httpMock: http, setAccessTokenMock } = jest.requireActual('./httpMock');
  return { httpClient: http, setAccessToken: setAccessTokenMock };
});

const profile: UserProfile = {
  id: 'u1',
  firstName: 'Ana',
  lastName: 'Pérez',
  phoneNumber: '+34600000000',
  avatarUrl: null,
  idDocumentUrl: 'supabase://documents/u1/dni.jpg',
  driverLicenseUrl: null,
  isVerified: true,
  createdAt: '2026-07-01T00:00:00.000Z'
};

const mutation = {
  firstName: 'Ana',
  lastName: 'Pérez',
  phoneNumber: '+34600000000',
  avatarUrl: null,
  idDocumentUrl: null,
  driverLicenseUrl: null
};

beforeEach(() => {
  resetHttpMock();
  useUserProfileStore.getState().reset();
});

describe('useUserProfileStore', () => {
  it('fetchMyProfile carga /users/me', async () => {
    httpMock.get.mockResolvedValue({ data: profile });

    await useUserProfileStore.getState().fetchMyProfile();

    expect(httpMock.get).toHaveBeenCalledWith('/users/me');
    expect(useUserProfileStore.getState()).toMatchObject({ profile, loading: false, error: null });
  });

  it('un fallo de red conserva el perfil previo (no "desverifica" al usuario)', async () => {
    useUserProfileStore.setState({ profile });
    httpMock.get.mockRejectedValue(Object.assign(new Error('Network Error'), { message: 'Network Error' }));

    await useUserProfileStore.getState().fetchMyProfile();

    expect(useUserProfileStore.getState().profile).toEqual(profile);
    expect(useUserProfileStore.getState().error).toMatch(/Sin conexión/);
  });

  it('updateMyProfile guarda y recarga el perfil', async () => {
    httpMock.put.mockResolvedValue({ data: {} });
    httpMock.get.mockResolvedValue({ data: profile });

    await expect(useUserProfileStore.getState().updateMyProfile(mutation)).resolves.toBe(true);

    expect(httpMock.put).toHaveBeenCalledWith('/users/me', mutation);
    expect(httpMock.get).toHaveBeenCalledWith('/users/me');
    expect(useUserProfileStore.getState()).toMatchObject({ profile, saving: false });
  });

  it('updateMyProfile devuelve false con el mensaje de la API', async () => {
    httpMock.put.mockRejectedValue(apiError(409, 'El teléfono ya está en uso'));

    await expect(useUserProfileStore.getState().updateMyProfile(mutation)).resolves.toBe(false);

    expect(useUserProfileStore.getState()).toMatchObject({ saving: false, mutationMessage: 'El teléfono ya está en uso' });
  });
});
