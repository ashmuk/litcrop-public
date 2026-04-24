/**
 * @litcrop/shared — Public API
 * Types, constants, and config shared across frontend, API, and simulator.
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

// Domain entity types and enums
export type {
  BedStatus,
  PlotStatus, // deprecated alias
  TriggerType,
  TagValue,
  Locale,
  Theme,
  TempUnit,
  PlantMethod,
  FarmRole,
  FarmMember,
  Farm,
  Bed,
  Image,
  Tag,
  UserProfile,
  DeviceStatus,
  StorageStatus,
  DeviceCapabilities,
  EffectiveConfig,
  Device,
  DeviceRegistrationResponse,
  DeviceConfigResponse,
  DeviceListItem,
  DiaryCategory,
  DiaryEntryType,
  CostItem,
  DiaryEntry,
  DiaryEntryResponse,
  NotificationType,
  Notification,
  ActivityItemType,
  ActivityItem,
  DiaryActivityItem,
  DeviceActivityItem,
  ImageActivityItem,
  ActivityFeedResponse,
  BedCrop,
  BedCropStatus,
} from './types/domain';

// API response/error types
export type {
  ApiResponse,
  PaginatedResponse,
  ApiError,
  ErrorCode,
  FarmBed,
  FarmResponse,
  FarmBedItem,
  BedDetailResponse,
  ImageListItem,
  ImageUploadResponse,
  ImageDetailResponse,
  TagCreateResponse,
  WeatherResponse,
  HourlyForecast,
  DailyForecast,
  WeatherAlert,
  WeatherImpactParams,
  CropImpactCard,
  ChatRequest,
  ChatResponse,
  UsageResponse,
  BedActiveCropSummary,
} from './types/api';

// API request types
export type {
  CreateFarmRequest,
  UpdateFarmRequest,
  UpdateBedRequest,
  CreateBedCropRequest,
  UpdateBedCropRequest,
  CreateTagRequest,
  ChatMessageRequest,
  UpdateProfileRequest,
} from './types/requests';

// Constants
export {
  BED_STATUS,
  BED_STATUS_VALUES,
  PLOT_STATUS,          // deprecated alias
  PLOT_STATUS_VALUES,   // deprecated alias
  TAG_VALUES,
  TRIGGER_TYPES,
  THEME_OPTIONS,
  DEFAULT_THEME,
  LOCALE_OPTIONS,
  DEFAULT_LOCALE,
  MAX_IMAGE_SIZE_BYTES,
  ACCEPTED_IMAGE_CONTENT_TYPE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  MIN_PAGE_LIMIT,
  WEATHER_CACHE_TTL_SECONDS,
  SIGNED_URL_EXPIRY_SECONDS,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  DEMO_FARM_ID,
  PILOT_MODE,
  FREE_PLAN_MAX_OWNED_FARMS,
  FREE_PLAN_MAX_MEMBERSHIPS,
  CROP_TYPES,
  DDB_KEY_PREFIXES,
  MAX_ACTIVE_CROPS_PER_BED,
  ACTIVITY_TTL_DAYS,
  NOTIFICATION_TTL_DAYS,
  ENV_ADMIN_EMAILS,
  DEVICE_STATUS_VALUES,
  STORAGE_STATUS_VALUES,
  MAX_NODE_NAME_LENGTH,
  MIN_CAPTURE_INTERVAL,
  MAX_CAPTURE_INTERVAL,
  S3_AVATAR_PREFIX,
  FARM_VISIBILITY_VALUES,
} from './constants';

// Config
export { DEFAULT_CONFIG } from './config';
export type { AppConfig } from './config';

// Zod schemas for contract tests and runtime validation
export {
  UpdateProfileRequestSchema,
  BedStatusSchema,
  PlotStatusSchema,     // deprecated alias
  TriggerTypeSchema,
  TagValueSchema,
  LocaleSchema,
  ThemeSchema,
  FarmRoleSchema,
  FarmMemberSchema,
  FarmsListResponseSchema,
  FarmBaseSchema,
  FarmBedSchema,
  FarmResponseSchema,
  FarmWriteResponseSchema,
  CreateFarmRequestSchema,
  UpdateFarmRequestSchema,
  FarmBedItemSchema,
  FarmBedsResponseSchema,
  BedDetailResponseSchema,
  UpdateBedRequestSchema,
  ImageListResponseSchema,
  ImageUploadResponseSchema,
  ImageDetailResponseSchema,
  TagCreateResponseSchema,
  WeatherResponseSchema,
  ChatResponseSchema,
  UsageResponseSchema,
  TempUnitSchema,
  UpdateSettingsRequestSchema,
  UserSettingsResponseSchema,
  DeviceStatusSchema,
  StorageStatusSchema,
  DeviceCapabilitiesSchema,
  DeviceListItemSchema,
  DeviceListResponseSchema,
  DeviceRegistrationResponseSchema,
  DeviceConfigResponseSchema,
  RegisterDeviceRequestSchema,
  UpdateDeviceRequestSchema,
  DeviceHeartbeatRequestSchema,
  ProfilePictureResponseSchema,
  DiaryCategorySchema,
  DiaryEntryTypeSchema,
  CostItemSchema,
  CreateDiaryEntrySchema,
  UpdateDiaryEntrySchema,
  DiaryListQuerySchema,
  DiaryEntryResponseSchema,
  DiaryListResponseSchema,
  FarmVisibilitySchema,
  ActivityItemTypeSchema,
  DiaryActivityItemSchema,
  DeviceActivityItemSchema,
  ImageActivityItemSchema,
  ActivityItemSchema,
  ActivityFeedResponseSchema,
  ActivityFeedQuerySchema,
  BedCropStatusSchema,
  BedCropSchema,
  CreateBedCropRequestSchema,
  UpdateBedCropRequestSchema,
  BedActiveCropSummarySchema,
} from './schemas/index';

// Crop library — shared types and data (#274)
export type { CropEntry } from './crop-library';
export { CROPS as CROP_LIBRARY, CROP_MAP as CROP_LIBRARY_MAP, getCropMeta, estimateHarvestDate, getCropPropagation } from './crop-library';
export type { CropPropagation } from './crop-library';
export { getDeviceClass } from './devices';
export type { DeviceClass } from './devices';

// Bed-crop helpers (#279 Wave A prep + Wave B compat shim)
export { hasActiveCrop, toBedActiveCropSummary } from './bed-crop';

// Timezone utilities
export { getTimezoneOffsetFromCoords } from './timezone';

// Validation utilities
export {
  isValidImageContentType,
  isValidImageSize,
  isValidTagValue,
  isValidBedStatus,
  isValidPlotStatus, // deprecated alias
  isValidTriggerType,
  isValidLatLng,
  isValidFarmId,
  isValidBedId,
  isValidPlotId,     // deprecated alias
  isValidImageId,
} from './validation';
