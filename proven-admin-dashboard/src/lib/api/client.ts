import { clearAuthToken, getApiBaseUrl, getAuthToken } from '../auth/token';

const API_URL = getApiBaseUrl();

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Type': 'proven-guardian',
    };

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    headers['X-Local-Date-Key'] = `${year}-${month}-${day}`;
    headers['X-UTC-Offset-Minutes'] = String(now.getTimezoneOffset());
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timeZone) headers['X-Timezone'] = timeZone;
    } catch {
      // No-op: backend can still use date key + offset.
    }

    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  async get<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const headers = await this.getAuthHeaders();

    const response = await fetch(this.buildUrl(endpoint, params), {
      method: 'GET',
      headers,
      ...fetchOptions,
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
        // Redirect to login on unauthorized
        window.location.href = '/login';
      }
      const error = await response.json().catch(() => ({ message: 'Something went wrong. Please try again.' }));
      throw new Error(error.message || 'Something went wrong. Please try again.');
    }

    return response.json();
  }

  async post<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const headers = await this.getAuthHeaders();

    const response = await fetch(this.buildUrl(endpoint, params), {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
      ...fetchOptions,
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
        window.location.href = '/login';
      }
      const error = await response.json().catch(() => ({ message: 'Something went wrong. Please try again.' }));
      throw new Error(error.message || 'Something went wrong. Please try again.');
    }

    return response.json();
  }

  async patch<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const headers = await this.getAuthHeaders();

    const response = await fetch(this.buildUrl(endpoint, params), {
      method: 'PATCH',
      headers,
      body: data ? JSON.stringify(data) : undefined,
      ...fetchOptions,
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
        window.location.href = '/login';
      }
      const error = await response.json().catch(() => ({ message: 'Something went wrong. Please try again.' }));
      throw new Error(error.message || 'Something went wrong. Please try again.');
    }

    return response.json();
  }

  async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const headers = await this.getAuthHeaders();

    const response = await fetch(this.buildUrl(endpoint, params), {
      method: 'DELETE',
      headers,
      ...fetchOptions,
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
        window.location.href = '/login';
      }
      const error = await response.json().catch(() => ({ message: 'Something went wrong. Please try again.' }));
      throw new Error(error.message || 'Something went wrong. Please try again.');
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_URL);
