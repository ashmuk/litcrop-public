/**
 * LitCrop API Client — T-FE-05, T-FE-AUTH-07
 *
 * Typed client for all endpoints.
 * Base URL: import.meta.env.PUBLIC_API_BASE_URL (Vite public env var)
 *           Falls back to '/api/v1' for same-origin SSR dev.
 *
 * All functions throw ApiError on non-2xx responses.
 * Authorization: Bearer token is injected automatically via getAccessToken().
 * On 401 the token is refreshed once; if refresh fails the user is redirected to /login.
 *
 * Updated: Phase D — Plot endpoints replaced by Bed endpoints (ADR-20260322)
 */

import { getAccessToken } from './auth';

import type {
  Farm,
  FarmRole,
  FarmMember,
  FarmResponse,
  FarmBedItem,
  BedDetailResponse,
  PaginatedResponse,
  ImageListItem,
  ImageUploadResponse,
  ImageDetailResponse,
  TagCreateResponse,
  WeatherResponse,
  ChatResponse,
  UsageResponse,
  Locale,
  Theme,
  TempUnit,
  ApiError as ApiErrorBody,
} from '@litcrop/shared';

import type { CreateFarmRequest, UpdateFarmRequest, UpdateBedRequest, CreateTagRequest, ChatMessageRequest } from '@litcrop/shared';

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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

/** GET /api/v1/farms — returns all farms the caller belongs to (with role), or empty array */
export async function getMyFarms(): Promise<Array<Farm & { role: FarmRole }>> {
  const res = await request<{ data: Array<Farm & { role: FarmRole }> }>('GET', '/farms');
  return res.data;
}

/** GET /api/v1/farms — returns the caller's first farm, or null if not set up yet */
export async function getMyFarm(): Promise<Farm | null> {
  const farms = await getMyFarms();
  return farms[0] ?? null;
}

export type FarmMemberItem = Omit<FarmMember, 'farm_id'> & { display_name: string };

/** GET /api/v1/farms/:farmId/members — list members of a farm */
export async function getFarmMembers(farmId: string): Promise<FarmMemberItem[]> {
  const res = await request<{ data: FarmMemberItem[] }>('GET', `/farms/${farmId}/members`);
  return res.data;
}

/** POST /api/v1/farms/:farmId/members — add a member to a farm */
export async function addFarmMember(
  farmId: string,
  data: { user_id: string; role: FarmRole },
): Promise<FarmMember> {
  return request<FarmMember>('POST', `/farms/${farmId}/members`, data);
}

/** GET /api/v1/farms/{farmId} */
export async function getFarm(farmId: string): Promise<FarmResponse> {
  return request<FarmResponse>('GET', `/farms/${farmId}`);
}

/** POST /api/v1/farms — returns flat Farm (no beds array) */
export async function createFarm(data: CreateFarmRequest): Promise<Farm> {
  return request<Farm>('POST', '/farms', data);
}

/** PATCH /api/v1/farms/{farmId} — returns flat Farm (no beds array) */
export async function updateFarm(farmId: string, data: UpdateFarmRequest): Promise<Farm> {
  return request<Farm>('PATCH', `/farms/${farmId}`, data);
}

/** DELETE /api/v1/farms/{farmId} — admin only, cascades to beds and members */
export async function deleteFarm(farmId: string): Promise<void> {
  await request<void>('DELETE', `/farms/${farmId}`);
}

/** DELETE /api/v1/farms/{farmId}/members/me — leave a farm you are a member of */
export async function leaveFarm(farmId: string): Promise<void> {
  await request<void>('DELETE', `/farms/${farmId}/members/me`);
}

// ── Bed Endpoints ────────────────────────────────────────────────

/** GET /api/v1/farms/{farmId}/beds */
export async function getBeds(farmId: string): Promise<FarmBedItem[]> {
  const res = await request<{ data: FarmBedItem[] }>('GET', `/farms/${farmId}/beds`);
  return res.data;
}

/** GET /api/v1/beds/{bedId} */
export async function getBed(bedId: string): Promise<BedDetailResponse> {
  return request<BedDetailResponse>('GET', `/beds/${bedId}`);
}

/** PATCH /api/v1/beds/{bedId} */
export async function updateBed(bedId: string, data: UpdateBedRequest): Promise<BedDetailResponse> {
  return request<BedDetailResponse>('PATCH', `/beds/${bedId}`, data);
}

// ── Image Endpoints ───────────────────────────────────────────────

/**
 * GET /api/v1/beds/{bedId}/images
 * @param cursor Opaque pagination cursor from a previous response's meta.next_cursor
 */
export async function getImages(
  bedId: string,
  cursor?: string,
): Promise<PaginatedResponse<ImageListItem>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<PaginatedResponse<ImageListItem>>('GET', `/beds/${bedId}/images${query}`);
}

/**
 * POST /api/v1/beds/{bedId}/images
 * @param bedId Target bed ID
 * @param formData FormData containing the JPEG image file under the "image" field
 */
export async function uploadImage(bedId: string, formData: FormData): Promise<ImageUploadResponse> {
  return request<ImageUploadResponse>('POST', `/beds/${bedId}/images`, formData, true);
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

// ── Me / Profile Endpoint ─────────────────────────────────────────

export interface UserProfileResponse {
  user_id: string;
  display_name: string;
  preferred_role: 'manager' | 'observer';
  created_at: string;
  is_admin: boolean;
}

/** GET /api/v1/me/profile */
export async function getMyProfile(): Promise<UserProfileResponse> {
  return request<UserProfileResponse>('GET', '/me/profile');
}

// ── Settings Endpoint ─────────────────────────────────────────────

export interface UserSettingsResponse {
  locale: Locale;
  temp_unit: TempUnit;
  theme: Theme;
  updated_at: string;
}

/** GET /api/v1/me/settings */
export async function getMySettings(): Promise<UserSettingsResponse> {
  return request<UserSettingsResponse>('GET', '/me/settings');
}

/** PATCH /api/v1/me/settings */
export async function updateMySettings(data: Partial<Pick<UserSettingsResponse, 'locale' | 'temp_unit' | 'theme'>>): Promise<UserSettingsResponse> {
  return request<UserSettingsResponse>('PATCH', '/me/settings', data);
}

/** PATCH /api/v1/me/profile */
export async function updateMyProfile(data: {
  display_name?: string;
  preferred_role?: 'manager' | 'observer';
}): Promise<UserProfileResponse> {
  return request<UserProfileResponse>('PATCH', '/me/profile', data);
}

export interface DeleteAccountResponse {
  deleted: boolean;
  summary: {
    farms_deleted: string[];
    farms_left: string[];
    farms_transferred: Array<{ farm_id: string; new_admin: string }>;
    join_requests_deleted: number;
    profile_deleted: boolean;
    settings_deleted: boolean;
  };
}

/** DELETE /api/v1/me — permanently delete caller's account and all associated data */
export async function deleteMyAccount(): Promise<DeleteAccountResponse> {
  return request<DeleteAccountResponse>('DELETE', '/me');
}

// ── Admin Endpoint ────────────────────────────────────────────────

export interface AdminStatsResponse {
  entity_counts: { farms: number; users: number; beds: number };
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

export interface AdminUserItem {
  user_id: string;
  display_name: string;
  preferred_role: 'manager' | 'observer';
  created_at: string;
}

export interface AdminFarmItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  grid_rows: number;
  grid_cols: number;
  member_count: number;
  created_at: string;
}

// ── Join Requests ─────────────────────────────────────────────────

export interface DiscoverableFarmItem {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  member_count: number;
  has_pending_request: boolean;
}

export interface JoinRequestItem {
  user_id: string;
  status: string;
  display_name: string;
  requested_at: string;
  resolved_at: string | null;
}

/** GET /api/v1/farms/discoverable */
export async function getDiscoverableFarms(): Promise<DiscoverableFarmItem[]> {
  const res = await request<{ data: DiscoverableFarmItem[] }>('GET', '/farms/discoverable');
  return res.data;
}

/** POST /api/v1/farms/:farmId/join */
export async function requestToJoinFarm(farmId: string): Promise<{ farm_id: string; status: string }> {
  return request<{ farm_id: string; status: string }>('POST', `/farms/${farmId}/join`, {});
}

/** GET /api/v1/farms/:farmId/join-requests */
export async function getJoinRequests(farmId: string, status = 'pending'): Promise<JoinRequestItem[]> {
  const res = await request<{ data: JoinRequestItem[] }>('GET', `/farms/${farmId}/join-requests?status=${status}`);
  return res.data;
}

/** PATCH /api/v1/farms/:farmId/join-requests/:userId */
export async function resolveJoinRequest(farmId: string, userId: string, action: 'approve' | 'reject'): Promise<void> {
  await request('PATCH', `/farms/${farmId}/join-requests/${userId}`, { action });
}

// ── Admin Endpoints ─────────────────────────────────────────────

/** GET /api/v1/admin/users — admin only */
export async function getAdminUsers(): Promise<{ users: AdminUserItem[]; total: number }> {
  return request<{ users: AdminUserItem[]; total: number }>('GET', '/admin/users');
}

/** GET /api/v1/admin/farms — admin only */
export async function getAdminFarms(): Promise<{ farms: AdminFarmItem[]; total: number }> {
  return request<{ farms: AdminFarmItem[]; total: number }>('GET', '/admin/farms');
}

// ── Notification Preferences ──────────────────────────────────────

export interface NotificationPrefsResponse {
  prefs: Record<string, boolean>;
  updated_at: string;
}

/** GET /api/v1/me/notification-preferences — admin only */
export async function getNotificationPrefs(): Promise<NotificationPrefsResponse> {
  return request<NotificationPrefsResponse>('GET', '/me/notification-preferences');
}

/** PATCH /api/v1/me/notification-preferences — admin only */
export async function updateNotificationPrefs(
  prefs: Record<string, boolean>,
): Promise<NotificationPrefsResponse> {
  return request<NotificationPrefsResponse>('PATCH', '/me/notification-preferences', { prefs });
}
