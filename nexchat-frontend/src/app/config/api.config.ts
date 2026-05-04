type RuntimeConfig = {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

declare global {
  interface Window {
    __NEXCHAT_CONFIG__?: RuntimeConfig;
  }
}

const runtimeConfig = typeof window !== 'undefined' ? window.__NEXCHAT_CONFIG__ : undefined;

export const API_BASE_URL = runtimeConfig?.apiBaseUrl ?? 'http://localhost:8080/api';
export const WS_BASE_URL = runtimeConfig?.wsBaseUrl ?? 'http://localhost:8080/ws';
