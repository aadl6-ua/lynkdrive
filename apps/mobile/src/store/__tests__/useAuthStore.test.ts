import { httpMock, resetHttpMock, setAccessTokenMock } from './httpMock';
import { useAuthStore } from '../useAuthStore';
import { useUserProfileStore } from '../useUserProfileStore';
import { useVehiclesStore } from '../useVehiclesStore';

jest.mock('../../api/http', () => {
  const { httpMock: http, setAccessTokenMock: setToken } = jest.requireActual('./httpMock');
  return { httpClient: http, setAccessToken: setToken };
});

const mockAuth = {
  onAuthStateChange: jest.fn(),
  getSession: jest.fn(),
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  resetPasswordForEmail: jest.fn()
};

// Getter: el factory se evalúa antes de inicializar mockAuth (jest.mock se eleva).
jest.mock('../../api/supabase', () => ({
  supabaseClient: {
    get auth() {
      return mockAuth;
    }
  }
}));

const session = (token = 'jwt-1') => ({ access_token: token, user: { id: 'user-1', email: 'ana@example.com' } });

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  resetHttpMock();
  Object.values(mockAuth).forEach((fn) => fn.mockReset());
  useAuthStore.setState(initialAuthState, true);
});

describe('useAuthStore', () => {
  it('hydrateSession restaura la sesión y configura el token de la API', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session() }, error: null });

    await useAuthStore.getState().hydrateSession();

    expect(setAccessTokenMock).toHaveBeenCalledWith('jwt-1');
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'user-1',
      email: 'ana@example.com',
      accessToken: 'jwt-1',
      hasHydrated: true,
      loading: false
    });
  });

  it('hydrateSession registra el listener una sola vez y este sincroniza el token', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    let freshStore!: typeof useAuthStore;
    jest.isolateModules(() => {
      freshStore = require('../useAuthStore').useAuthStore;
    });

    await freshStore.getState().hydrateSession();
    await freshStore.getState().hydrateSession();

    expect(mockAuth.onAuthStateChange).toHaveBeenCalledTimes(1);

    const listener = mockAuth.onAuthStateChange.mock.calls[0][0];
    listener('TOKEN_REFRESHED', session('jwt-renovado'));

    expect(setAccessTokenMock).toHaveBeenLastCalledWith('jwt-renovado');
    expect(freshStore.getState()).toMatchObject({ userId: 'user-1', accessToken: 'jwt-renovado' });
  });

  it('hydrateSession sin sesión marca hidratado y limpia el token', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await useAuthStore.getState().hydrateSession();

    expect(setAccessTokenMock).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState()).toMatchObject({ userId: null, hasHydrated: true });
  });

  it('hydrateSession ante error deja la app hidratada sin sesión', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Failed to fetch' } });

    await useAuthStore.getState().hydrateSession();

    expect(setAccessTokenMock).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState()).toMatchObject({
      hasHydrated: true,
      loading: false,
      error: 'Sin conexión. Revisa tu red e inténtalo de nuevo.'
    });
  });

  it('signIn exige email y contraseña', async () => {
    await useAuthStore.getState().signIn();

    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBe('Introduce tu email y tu contraseña.');
  });

  it('signIn recorta el email, guarda la sesión y borra la contraseña del estado', async () => {
    useAuthStore.setState({ emailInput: '  ana@example.com ', passwordInput: 'secreta123' });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session: session('jwt-2') }, error: null });

    await useAuthStore.getState().signIn();

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secreta123' });
    expect(setAccessTokenMock).toHaveBeenCalledWith('jwt-2');
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', accessToken: 'jwt-2', passwordInput: '', loading: false });
  });

  it('signIn traduce los errores de Supabase', async () => {
    useAuthStore.setState({ emailInput: 'ana@example.com', passwordInput: 'mala' });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } });

    await useAuthStore.getState().signIn();

    expect(useAuthStore.getState()).toMatchObject({ loading: false, error: 'Email o contraseña incorrectos.' });
  });

  it('signUp con sesión inmediata guarda el perfil mínimo y lo recarga', async () => {
    useAuthStore.setState({ emailInput: 'ana@example.com', passwordInput: 'secreta123' });
    mockAuth.signUp.mockResolvedValue({ data: { session: session('jwt-3') }, error: null });
    httpMock.put.mockResolvedValue({ data: {} });
    httpMock.get.mockResolvedValue({ data: { id: 'user-1', firstName: 'Ana' } });

    await useAuthStore.getState().signUp({ firstName: 'Ana', lastName: 'Pérez', phoneNumber: '+34600000000' });

    expect(httpMock.put).toHaveBeenCalledWith('/users/me', {
      firstName: 'Ana',
      lastName: 'Pérez',
      phoneNumber: '+34600000000',
      avatarUrl: null,
      idDocumentUrl: null,
      driverLicenseUrl: null
    });
    expect(httpMock.get).toHaveBeenCalledWith('/users/me');
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', loading: false, passwordInput: '' });
  });

  it('signUp reintenta guardar el perfil mientras el trigger crea la fila del usuario', async () => {
    jest.useFakeTimers();
    useAuthStore.setState({ emailInput: 'ana@example.com', passwordInput: 'secreta123' });
    mockAuth.signUp.mockResolvedValue({ data: { session: session() }, error: null });
    httpMock.put.mockRejectedValueOnce(new Error('404')).mockRejectedValueOnce(new Error('404')).mockResolvedValue({ data: {} });
    httpMock.get.mockResolvedValue({ data: {} });

    const promise = useAuthStore.getState().signUp({ firstName: 'Ana', lastName: 'Pérez', phoneNumber: '600' });
    await jest.runAllTimersAsync();
    await promise;
    jest.useRealTimers();

    expect(httpMock.put).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('signUp sin sesión (confirmación por email) avisa al usuario', async () => {
    useAuthStore.setState({ emailInput: 'ana@example.com', passwordInput: 'secreta123' });
    mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });

    await useAuthStore.getState().signUp({ firstName: 'Ana', lastName: 'Pérez', phoneNumber: '600' });

    expect(httpMock.put).not.toHaveBeenCalled();
    expect(useAuthStore.getState().message).toMatch(/email para confirmarla/);
  });

  it('signUp traduce usuario ya registrado', async () => {
    useAuthStore.setState({ emailInput: 'ana@example.com', passwordInput: 'secreta123' });
    mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: { message: 'User already registered' } });

    await useAuthStore.getState().signUp();

    expect(useAuthStore.getState().error).toMatch(/Ya existe una cuenta/);
  });

  it('signOut limpia token, sesión y stores dependientes', async () => {
    useAuthStore.setState({ userId: 'user-1', accessToken: 'jwt', email: 'ana@example.com' });
    useUserProfileStore.setState({ profile: { id: 'user-1' } as never });
    useVehiclesStore.setState({ myItems: [{ id: 'v1' }] as never, myLoaded: true });
    mockAuth.signOut.mockResolvedValue({ error: null });

    await useAuthStore.getState().signOut();

    expect(setAccessTokenMock).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState()).toMatchObject({ userId: null, accessToken: null, email: null, loading: false });
    expect(useUserProfileStore.getState().profile).toBeNull();
    expect(useVehiclesStore.getState()).toMatchObject({ myItems: [], myLoaded: false });
  });

  it('requestPasswordReset valida el email antes de llamar a Supabase', async () => {
    useAuthStore.setState({ emailInput: 'no-es-email' });

    await expect(useAuthStore.getState().requestPasswordReset()).resolves.toBe(false);
    expect(mockAuth.resetPasswordForEmail).not.toHaveBeenCalled();

    useAuthStore.setState({ emailInput: ' ana@example.com ' });
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(useAuthStore.getState().requestPasswordReset()).resolves.toBe(true);
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', expect.objectContaining({}));
    expect(useAuthStore.getState().message).toMatch(/recibirás un enlace/);
  });

  it('clearFeedback limpia error y mensaje', () => {
    useAuthStore.setState({ error: 'x', message: 'y' });
    useAuthStore.getState().clearFeedback();
    expect(useAuthStore.getState()).toMatchObject({ error: null, message: null });
  });
});
