import { httpClient } from '../../api/http';

export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  await httpClient.post('/push-tokens', { token, platform });
}

export async function deletePushToken(token: string): Promise<void> {
  await httpClient.delete(`/push-tokens/${encodeURIComponent(token)}`);
}
