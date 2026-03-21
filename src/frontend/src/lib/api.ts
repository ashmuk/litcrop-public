/**
 * LitCrop API Client — T-FE-05, T-FE-AUTH-07
 *
 * Typed client for all 11 endpoints.
 * Base URL: import.meta.env.PUBLIC_API_BASE_URL (Vite public env var)
 *           Falls back to '/api/v1' for same-origin SSR dev.
 *
 * All functions throw ApiError on non-2xx responses.
 * Authorization: Bearer token is injected automatically via getAccessToken().
 * On 401 the token is refreshed once; if refresh fails the user is redirected to /login.
 */

import { getAccessToken } from './auth';

import type {
  Farm,
  Plot,
  FarmResponse,
  FarmPlotItem,
  PlotDetailResponse,
  PaginatedResponse,
  ImageListItem,
  ImageUploadResponse,
  ImageDetailResponse,
  TagCreateResponse,
  WeatherResponse,
  ChatResponse,
  UsageResponse,
  ApiError as ApiErrorBody,
} from '@litcrop/shared';

import type { CreateFarmRequest, UpdateFarmRequest, CreatePlotRequest, CreateTagRequest, ChatMessageRequest } from '@litcrop/shared';

// ── Base URL ──────────────────────────────────────────────────────

function getBaseUrl(): string {
  // Vite exposes PUBLIC_ prefixed vars to the browser bundle
  const envBase = (import.meta as { env?: Record<string, string> }).env?.PUBLIC_API_BASE_URL;
  return envBase ?? '/api/v1';
}

// ── Error Type ────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorBody: ApiErrorBody;

  constructor(statusCode: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorBody = body;
  }
}

// ── Internal fetch wrapper ────────────────────────────────────────

/**
 * Core fetch helper. Automatically injects the Authorization header from the
 * auth service. On 401, refreshes the token once and retries; if the refresh
 * fails the user is redirected to /login.
 */
async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  isFormData = false,
  _retry = true,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!isFormData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let requestBody: BodyInit | undefined;
  if (isFormData) {
    requestBody = body as FormData;
  } else if (body !== undefined) {
    requestBody = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: requestBody,
  });

  // On 401: attempt token refresh and retry once
  if (res.status === 401 && _retry) {
    // Re-call getAccessToken() — it will attempt a refresh internally
    const newToken = await getAccessToken();
    if (newToken && newToken !== token) {
      return request<T>(method, path, body, isFormData, false);
    }
    // Refresh failed — redirect to login
    try {
      sessionStorage.setItem('litcrop_return_url', window.location.pathname + window.location.search);
    } catch {
      // ignore
    }
    window.location.replace('/login/');
    throw new ApiError(401, {
      error: { code: 'UNAUTHORIZED', message: 'Session expired. Please log in again.' },
    });
  }

  if (!res.ok) {
    let errorBody: ApiErrorBody;
    try {
      errorBody = (await res.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body
      errorBody = {
        error: {
          code: 'INTERNAL_ERROR',
          message: `HTTP ${res.status} ${res.statusText}`,
        },
      };
    }
    throw new ApiError(res.status, errorBody);
  }

  // 204 No Content — return empty object cast to T
  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

// ── Farm Endpoints ────────────────────────────────────────────────

/** GET /api/v1/farms — returns the caller's own farm, or null if not set up yet */
export async function getMyFarm(): Promise<Farm | null> {
  const res = await request<{ data: Farm[] }>('GET', '/farms');
  return res.data[0] ?? null;
}

/** GET /api/v1/farms/{farmId} */
export async function getFarm(farmId: string): Promise<FarmResponse> {
  return request<FarmResponse>('GET', `/farms/${farmId}`);
}

/** POST /api/v1/farms — returns flat Farm (no fields array) */
export async function createFarm(data: CreateFarmRequest): Promise<Farm> {
  return request<Farm>('POST', '/farms', data);
}

/** PATCH /api/v1/farms/{farmId} — returns flat Farm (no fields array) */
export async function updateFarm(farmId: string, data: UpdateFarmRequest): Promise<Farm> {
  return request<Farm>('PATCH', `/farms/${farmId}`, data);
}

// ── Plot Endpoints ────────────────────────────────────────────────

/** POST /api/v1/farms/{farmId}/plots — create a plot (auto-creates Field+Bed if needed) */
export async function createPlot(farmId: string, data: CreatePlotRequest): Promise<Plot> {
  return request<Plot>('POST', `/farms/${farmId}/plots`, data);
}

/** GET /api/v1/farms/{farmId}/plots */
export async function getPlots(farmId: string): Promise<FarmPlotItem[]> {
  const res = await request<{ data: FarmPlotItem[] }>('GET', `/farms/${farmId}/plots`);
  return res.data;
}

/** GET /api/v1/plots/{plotId} */
export async function getPlot(plotId: string): Promise<PlotDetailResponse> {
  return request<PlotDetailResponse>('GET', `/plots/${plotId}`);
}

// ── Image Endpoints ───────────────────────────────────────────────

/**
 * GET /api/v1/plots/{plotId}/images
 * @param cursor Opaque pagination cursor from a previous response's meta.next_cursor
 */
export async function getImages(
  plotId: string,
  cursor?: string,
): Promise<PaginatedResponse<ImageListItem>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<PaginatedResponse<ImageListItem>>('GET', `/plots/${plotId}/images${query}`);
}

/**
 * POST /api/v1/plots/{plotId}/images
 * @param plotId Target plot ID
 * @param formData FormData containing the JPEG image file under the "image" field
 */
export async function uploadImage(plotId: string, formData: FormData): Promise<ImageUploadResponse> {
  return request<ImageUploadResponse>('POST', `/plots/${plotId}/images`, formData, true);
}

/** GET /api/v1/images/{imageId} */
export async function getImage(imageId: string): Promise<ImageDetailResponse> {
  return request<ImageDetailResponse>('GET', `/images/${imageId}`);
}

// ── Tag Endpoint ──────────────────────────────────────────────────

/** POST /api/v1/images/{imageId}/tags */
export async function createTag(imageId: string, data: CreateTagRequest): Promise<TagCreateResponse> {
  return request<TagCreateResponse>('POST', `/images/${imageId}/tags`, data);
}

// ── Weather Endpoint ──────────────────────────────────────────────

/** GET /api/v1/farms/{farmId}/weather */
export async function getWeather(farmId: string): Promise<WeatherResponse> {
  return request<WeatherResponse>('GET', `/farms/${farmId}/weather`);
}

// ── Chat Endpoint ─────────────────────────────────────────────────

/** POST /api/v1/chat */
export async function sendChat(data: ChatMessageRequest): Promise<ChatResponse> {
  return request<ChatResponse>('POST', '/chat', data);
}

// ── Usage Endpoint ────────────────────────────────────────────────

/** GET /api/v1/usage */
export async function getUsage(): Promise<UsageResponse> {
  return request<UsageResponse>('GET', '/usage');
}

// ── Admin Endpoint ────────────────────────────────────────────────

export interface AdminStatsResponse {
  entity_counts: { farms: number; users: number; plots: number };
  global_budget: {
    input_tokens_used: number;
    input_tokens_limit: number;
    output_tokens_used: number;
    output_tokens_limit: number;
    utilization_pct: number;
  };
  period_start: string;
  reset_at: string;
}

/** GET /api/v1/admin/stats — admin only, returns 403 for non-admins */
export async function getAdminStats(): Promise<AdminStatsResponse> {
  return request<AdminStatsResponse>('GET', '/admin/stats');
}
