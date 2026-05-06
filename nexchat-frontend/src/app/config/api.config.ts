type RuntimeConfig = {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  /** When true, log axios requests/responses to console. */
  enableApiLogging?: boolean;
};

declare global {
  interface Window {
    __NEXCHAT_CONFIG__?: RuntimeConfig;
  }
}

const runtimeConfig = typeof window !== 'undefined' ? window.__NEXCHAT_CONFIG__ : undefined;

export const API_BASE_URL = runtimeConfig?.apiBaseUrl ?? 'http://localhost:8080/api';
export const WS_BASE_URL = runtimeConfig?.wsBaseUrl ?? 'http://localhost:8080/ws';

/** Verbose HTTP logs (defaults on when hostname is localhost/127.0.0.1 unless overridden). */
export const ENABLE_API_LOGGING =
    runtimeConfig?.enableApiLogging ??
    (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
