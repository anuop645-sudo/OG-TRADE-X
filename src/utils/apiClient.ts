import { auth, authReadyPromise, getFirebaseIdToken } from '../firebase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let cachedRuntimeApiBaseUrl: string | null = null;
let runtimeApiConfigPromise: Promise<string> | null = null;

async function resolveApiBaseUrl(): Promise<string> {
  const buildTimeUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (buildTimeUrl) {
    return buildTimeUrl;
  }
  if (cachedRuntimeApiBaseUrl !== null) {
    return cachedRuntimeApiBaseUrl;
  }
  if (!runtimeApiConfigPromise) {
    runtimeApiConfigPromise = (async () => {
      try {
        const res = await fetch('/api-config.json', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          cachedRuntimeApiBaseUrl = '';
          return '';
        }
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('application/json')) {
          cachedRuntimeApiBaseUrl = '';
          return '';
        }
        const data = (await res.json()) as { apiBaseUrl?: unknown };
        const url =
          typeof data?.apiBaseUrl === 'string'
            ? data.apiBaseUrl.trim().replace(/\/+$/, '')
            : '';
        cachedRuntimeApiBaseUrl = url;
        return url;
      } catch {
        cachedRuntimeApiBaseUrl = '';
        return '';
      }
    })();
  }
  return runtimeApiConfigPromise;
}

async function performAuthorizedFetch(
  targetUrl: string,
  method: 'GET' | 'POST',
  token: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let isCrossOrigin = false;
  try {
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      isCrossOrigin = new URL(targetUrl).origin !== window.location.origin;
    }
  } catch {
    isCrossOrigin = false;
  }

  try {
    return await fetch(targetUrl, {
      method,
      mode: isCrossOrigin ? 'cors' : 'same-origin',
      credentials: isCrossOrigin ? 'omit' : 'same-origin',
      cache: 'no-store',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Network or CORS error calling ${targetUrl}: ${detail}. Verify the backend server URL is reachable and up.`,
      0
    );
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
  } = {}
): Promise<T> {
  await authReadyPromise;
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError('Please sign in with your Firebase account first.', 401);
  }

  let token = await getFirebaseIdToken(false);
  if (!token) {
    throw new ApiError('Unable to obtain a valid Firebase ID token. Please sign in again.', 401);
  }

  const baseUrl = await resolveApiBaseUrl();
  const targetUrl = path.startsWith('http')
    ? path
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const method = options.method ?? 'POST';

  let response = await performAuthorizedFetch(targetUrl, method, token, options.body);
  if (response.status === 401) {
    const refreshed = await getFirebaseIdToken(true);
    if (refreshed && refreshed !== token) {
      token = refreshed;
      response = await performAuthorizedFetch(targetUrl, method, token, options.body);
    }
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text().catch(() => '');
  const trimmed = rawText.trim();
  const isHtml =
    contentType.includes('text/html') ||
    trimmed.toLowerCase().startsWith('<!doctype') ||
    trimmed.toLowerCase().startsWith('<html');

  let parsed: unknown = null;
  if (
    trimmed.length > 0 &&
    !isHtml &&
    (contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('['))
  ) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  const isAuthRedirect =
    response.redirected &&
    (response.url.includes('__cookie_check.html') || response.url.includes('applet-auth-bridge'));

  if (isAuthRedirect) {
    throw new ApiError(
      `Preview session cookie check intercepted ${path}. Reload the preview window and sign in again.`,
      401
    );
  }

  if (!response.ok) {
    const jsonErr =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : null;

    if (jsonErr) {
      throw new ApiError(jsonErr, response.status);
    }
    if (response.status === 403 && isHtml) {
      throw new ApiError(
        `Access denied (403) on ${path}: Admin privileges are required or the preview session rejected the request.`,
        403
      );
    }
    if (response.status === 404 && isHtml && !baseUrl) {
      throw new ApiError(
        `Server returned HTML instead of JSON (HTTP 404) for ${path}. Static hosting (such as Netlify Drop) does not run /api routes — set apiBaseUrl in api-config.json to your deployed backend URL or deploy via Git to Netlify.`,
        404
      );
    }
    if ((response.status === 502 || response.status === 503 || response.status === 504) && isHtml) {
      throw new ApiError(
        `Backend service temporarily unavailable (${response.status}) on ${path}. Please retry in a moment.`,
        response.status
      );
    }
    throw new ApiError(
      isHtml
        ? `Server returned HTML instead of JSON (HTTP ${response.status}) for ${path}.`
        : `Server error (${response.status}): unexpected non-JSON response from ${path}.`,
      response.status
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ApiError(
      isHtml
        ? `API endpoint ${path} returned HTML instead of JSON (HTTP ${response.status}).`
        : `Server returned an unexpected non-JSON response (HTTP ${response.status}) for ${path}.`,
      response.status || 502
    );
  }

  return parsed as T;
}
