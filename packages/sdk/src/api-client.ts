/**
 * Thin typed client for the Owo API. Kept dependency-free (uses fetch) so it runs
 * in the browser PWA, the admin console, and Node. Auth is a SIWE-derived JWT
 * (Section 3) passed as a bearer token.
 */
export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current bearer token, or null when unauthenticated. */
  getToken?: () => string | null;
  fetch?: typeof fetch;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class OwoApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.getToken = opts.getToken ?? (() => null);
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.getToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new ApiError(res.status, `${init?.method ?? 'GET'} ${path} -> ${res.status}`);
    }
    return (await res.json()) as T;
  }

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }
}
