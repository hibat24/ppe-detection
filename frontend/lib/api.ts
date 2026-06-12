import axios from 'axios';

// Resolve Backend REST API base URL
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Resolve Backend WebSocket base URL
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8000';

/**
 * Dynamically resolves the WebSocket URL based on window context,
 * addressing protocol mismatches (ws:// vs wss://) and dynamic host routing.
 */
export const getWebSocketUrl = (endpointPath: string): string => {
  if (typeof window === 'undefined') return '';

  // Ensure path starts with a slash
  const path = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  // 1. If explicit env variable is present, use it
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const base = process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, '');
    return `${base}${path}`;
  }

  // 2. Fall back to current window location protocol and hostname
  const isHttps = window.location.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';
  
  // Use 127.0.0.1 in dev to bypass Windows IPv6 resolution delays, or current hostname in local network
  const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '127.0.0.1:8000'
    : `${window.location.hostname}:8000`;

  return `${wsProtocol}//${host}${path}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor to format errors uniformly
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'An unknown network error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;
