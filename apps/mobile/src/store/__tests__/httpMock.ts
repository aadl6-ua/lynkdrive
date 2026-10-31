/** Mock compartido de `api/http` para los tests de stores. */
export const httpMock = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
};

export const setAccessTokenMock = jest.fn();

export function resetHttpMock() {
  for (const fn of Object.values(httpMock)) {
    fn.mockReset();
  }
  setAccessTokenMock.mockReset();
}

/** Error con la forma que devuelve Axios ante una respuesta de NestJS. */
export function apiError(status: number, message: string | string[]) {
  return Object.assign(new Error('Request failed'), { response: { status, data: { message } } });
}

/** Promesa controlable para probar respuestas que llegan desordenadas. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
