import axios from 'axios';

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const httpClient = axios.create({
  baseURL,
  timeout: 10000
});

httpClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});
