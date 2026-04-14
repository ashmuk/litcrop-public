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

export type FarmMemberItem = Omit<FarmMember, 'farm_id'> & { display_name: string; profile_picture_thumb_url: string | null };

/** GET /api/v1/farms/:farmId/members — list members of a farm */
export async function getFarmMembers(farmId: string): Promise<FarmMemberItem[]> {
  const res = await request<{ data: FarmMemberItem[] }>('GET', `/farms/${farmId}/members`);
  return res.data;
}

/** PATCH /api/v1/farms/:farmId/members/:userId — change member role */
export async function changeMemberRole(farmId: string, userId: string, role: 'owner' | 'staff'): Promise<void> {
  await request('PATCH', `/farms/${farmId}/members/${userId}`, { role });
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
  preferred_role: 'owner' | 'staff';
  created_at: string;
  is_admin: boolean;
  profile_picture_url: string | null;
  profile_picture_thumb_url: string | null;
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
  preferred_role?: 'owner' | 'staff';
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
  notifications_enabled?: boolean;
}

/** GET /api/v1/admin/stats — admin only, returns 403 for non-admins */
export async function getAdminStats(): Promise<AdminStatsResponse> {
  return request<AdminStatsResponse>('GET', '/admin/stats');
}

export interface AdminUserItem {
  user_id: string;
  display_name: string;
  preferred_role: 'owner' | 'staff';
  created_at: string;
}

export interface AdminFarmItem {
  id: string;
  name: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
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
  location_text: string;
  latitude: number | null;
  longitude: number | null;
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
  const res = await request<{ data: JoinRequestItem[] }>('GET', `/farms/${farmId}/join-requests?status=${encodeURIComponent(status)}`);
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

/** DELETE /api/v1/admin/users/:userId — admin only (#282) */
/** POST /api/v1/admin/notifications/test — send diagnostic email (#298) */
export async function adminTestNotification(): Promise<{ success: boolean; enabled: boolean; from: string; to: string[]; error?: string }> {
  return request<{ success: boolean; enabled: boolean; from: string; to: string[]; error?: string }>('POST', '/admin/notifications/test', {});
}

export async function adminDeleteUser(userId: string): Promise<{ deleted: boolean; summary: Record<string, unknown> }> {
  return request<{ deleted: boolean; summary: Record<string, unknown> }>('DELETE', `/admin/users/${userId}`);
}

/** GET /api/v1/admin/farms — admin only */
export async function getAdminFarms(): Promise<{ farms: AdminFarmItem[]; total: number }> {
  return request<{ farms: AdminFarmItem[]; total: number }>('GET', '/admin/farms');
}

// ── Activity Log Endpoint ─────────────────────────────────────────

export interface ActivityItem {
  id: string;
  event_type: string;
  actor_id: string;
  actor_email: string;
  target_type: string;
  target_id: string;
  target_name: string;
  farm_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface ActivityResponse {
  activities: ActivityItem[];
  next_cursor?: string;
}

/** GET /api/v1/admin/activity — admin only */
export async function getAdminActivities(params: {
  from?: string;
  to?: string;
  event_type?: string;
  user_id?: string;
  farm_id?: string;
  q?: string;
  cursor?: string;
  limit?: number;
} = {}): Promise<ActivityResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.event_type) qs.set('event_type', params.event_type);
  if (params.user_id) qs.set('user_id', params.user_id);
  if (params.farm_id) qs.set('farm_id', params.farm_id);
  if (params.q) qs.set('q', params.q);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<ActivityResponse>('GET', `/admin/activity${query}`);
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

// ── Device Management (Beta-5) ──────────────────────────────────

export interface DeviceListItemResponse {
  device_id: string;
  farm_id: string;
  bed_id: string;
  bed_name: string;
  node_name: string;
  status: 'online' | 'offline' | 'inactive';
  capture_interval: number;
  resolution: string;
  jpeg_quality: number;
  active_window: { start: string; end: string };
  trigger_type: 'scheduled';
  last_seen_at: string | null;
  battery_level: number | null;
  wifi_signal_dbm: number | null;
  storage_status: 'ok' | 'low' | 'full' | null;
  capabilities: { resolutions: string[]; has_battery_sensor: boolean; has_pir_sensor: boolean } | null;
  test_shot_requested: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeviceRegistrationResult {
  device_id: string;
  node_name: string;
  bed_id: string;
  device_api_key: string;
  config_poll_url: string;
  created_at: string;
}

export async function getDevices(farmId: string): Promise<{ devices: DeviceListItemResponse[] }> {
  return request<{ devices: DeviceListItemResponse[] }>('GET', `/farms/${farmId}/devices`);
}

export async function registerDevice(
  farmId: string,
  data: { node_name: string; bed_id: string },
): Promise<DeviceRegistrationResult> {
  return request<DeviceRegistrationResult>('POST', `/farms/${farmId}/devices`, data);
}

export async function updateDevice(
  farmId: string,
  deviceId: string,
  data: Record<string, unknown>,
): Promise<DeviceListItemResponse> {
  return request<DeviceListItemResponse>('PATCH', `/farms/${farmId}/devices/${deviceId}`, data);
}

export async function deleteDevice(
  farmId: string,
  deviceId: string,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>('DELETE', `/farms/${farmId}/devices/${deviceId}`);
}

export async function requestTestShot(
  farmId: string,
  deviceId: string,
): Promise<{ test_shot_requested: boolean }> {
  return request<{ test_shot_requested: boolean }>('POST', `/farms/${farmId}/devices/${deviceId}/test-shot`);
}

// ── Diary (Beta-7) ──────────────────────────────────────────────

export interface DiaryEntryResponse {
  id: string;
  farm_id: string;
  date: string;
  category: string;
  entry_type: 'reserved' | 'actual';
  description: string;
  time_spent_minutes: number | null;
  bed_id: string | null;
  bed_name: string | null;
  photo_ids: string[];
  costs: { item: string; amount: number; currency: 'JPY' | 'USD' }[];
  cost_total: number;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  // Beta-10: harvest & revenue fields (populated when category === 'harvesting')
  harvest_amount: number | null;
  harvest_unit: string | null;
  revenue: number | null;
  revenue_currency: 'JPY' | 'USD' | null;
}

export interface DiaryListResponse {
  data: DiaryEntryResponse[];
  meta: { count: number; limit: number; next_cursor: string | null };
}

export async function getDiaryEntries(
  farmId: string,
  params?: { from?: string; to?: string; category?: string; limit?: number; cursor?: string },
): Promise<DiaryListResponse> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.category) query.set('category', params.category);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);
  const qs = query.toString();
  return request<DiaryListResponse>('GET', `/farms/${farmId}/diary${qs ? `?${qs}` : ''}`);
}

export async function getDiaryEntry(farmId: string, entryId: string): Promise<DiaryEntryResponse> {
  return request<DiaryEntryResponse>('GET', `/farms/${farmId}/diary/${entryId}`);
}

export async function createDiaryEntry(
  farmId: string,
  data: {
    date: string;
    category: string;
    description: string;
    time_spent_minutes?: number | null;
    bed_id?: string | null;
    photo_ids?: string[];
    costs?: { item: string; amount: number; currency: 'JPY' | 'USD' }[];
  },
): Promise<DiaryEntryResponse> {
  return request<DiaryEntryResponse>('POST', `/farms/${farmId}/diary`, data);
}

export async function updateDiaryEntry(
  farmId: string,
  entryId: string,
  data: Record<string, unknown>,
): Promise<DiaryEntryResponse> {
  return request<DiaryEntryResponse>('PATCH', `/farms/${farmId}/diary/${entryId}`, data);
}

export async function deleteDiaryEntry(farmId: string, entryId: string): Promise<void> {
  await request<void>('DELETE', `/farms/${farmId}/diary/${entryId}`);
}

// ── Profile Picture (Beta-5) ────────────────────────────────────

export interface ProfilePictureResult {
  profile_picture_url: string;
  profile_picture_thumb_url: string;
}

export async function uploadProfilePicture(formData: FormData): Promise<ProfilePictureResult> {
  return request<ProfilePictureResult>('POST', '/me/profile-picture', formData, true);
}

export async function deleteProfilePicture(): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>('DELETE', '/me/profile-picture');
}

// ── Bug Report (#280) ────────────────────────────────────────────

export async function sendBugReport(description: string, steps: string): Promise<{ sent: boolean }> {
  return request<{ sent: boolean }>('POST', '/me/bug-report', { description, steps });
}

// ── In-app Notifications (#391) ─────────────────────────────────

export interface NotificationItem {
  id: string;
  type: 'join_approved' | 'join_rejected' | 'role_changed';
  title: string;
  body: string;
  farm_id?: string;
  farm_name?: string;
  read: boolean;
  created_at: string;
}

/** GET /api/v1/me/notifications */
export async function getNotifications(limit = 20): Promise<NotificationItem[]> {
  const res = await request<{ data: NotificationItem[] }>('GET', `/me/notifications?limit=${limit}`);
  return res.data;
}

/** GET /api/v1/me/notifications/unread-count */
export async function getNotificationUnreadCount(): Promise<number> {
  const res = await request<{ count: number }>('GET', '/me/notifications/unread-count');
  return res.count;
}

/** PATCH /api/v1/me/notifications/:notifId/read */
export async function markNotificationRead(notifId: string): Promise<void> {
  await request('PATCH', `/me/notifications/${notifId}/read`, {});
}

/** POST /api/v1/me/notifications/read-all */
export async function markAllNotificationsRead(): Promise<number> {
  const res = await request<{ marked: number }>('POST', '/me/notifications/read-all', {});
  return res.marked;
}
