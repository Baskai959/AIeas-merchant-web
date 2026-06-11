type WebSocketQueryValue = string | number | boolean | null | undefined;

const DEFAULT_WS_BASE_URL = '/ws';

function getCurrentWebSocketOrigin() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

function normalizeWebSocketBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '');

  if (/^wss?:\/\//i.test(trimmedBaseUrl)) {
    return trimmedBaseUrl;
  }

  if (/^https?:\/\//i.test(trimmedBaseUrl)) {
    return trimmedBaseUrl.replace(/^http/i, 'ws');
  }

  const path = trimmedBaseUrl.startsWith('/')
    ? trimmedBaseUrl
    : `/${trimmedBaseUrl}`;

  return `${getCurrentWebSocketOrigin()}${path}`;
}

export function buildWebSocketUrl(
  path: string,
  query: Record<string, WebSocketQueryValue> = {}
) {
  const baseUrl = normalizeWebSocketBaseUrl(
    import.meta.env.VITE_WS_BASE_URL || DEFAULT_WS_BASE_URL
  );
  const normalizedPath = path.replace(/^\/+/, '');
  const url = new URL(`${baseUrl}/${normalizedPath}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}
