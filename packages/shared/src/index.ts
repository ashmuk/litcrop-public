/**
 * @litcrop/shared — Public API
 * Types, constants, and config shared across frontend, API, and simulator.
 */

// Domain entity types and enums
export type {
  PlotStatus,
  TriggerType,
  TagValue,
  Locale,
  Theme,
  TempUnit,
  Farm,
  Field,
  Bed,
  Plot,
  Image,
  Tag,
} from './types/domain';

// API response/error types
export type {
  ApiResponse,
  PaginatedResponse,
  ApiError,
  ErrorCode,
  FarmResponse,
  FarmPlotItem,
  PlotDetailResponse,
  ImageListItem,
  ImageUploadResponse,
  ImageDetailResponse,
  TagCreateResponse,
  WeatherResponse,
  HourlyForecast,
  DailyForecast,
  WeatherAlert,
  CropImpactCard,
  ChatRequest,
  ChatResponse,
} from './types/api';

// API request types
export type {
  CreateFarmRequest,
  UpdateFarmRequest,
  CreateTagRequest,
  ChatMessageRequest,
} from './types/requests';

// Constants
export {
  PLOT_STATUS,
  PLOT_STATUS_VALUES,
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
  DDB_KEY_PREFIXES,
} from './constants';

// Config
export { DEFAULT_CONFIG } from './config';
export type { AppConfig } from './config';

// Validation utilities
export {
  isValidImageContentType,
  isValidImageSize,
  isValidTagValue,
  isValidPlotStatus,
  isValidTriggerType,
  isValidLatLng,
  isValidFarmId,
  isValidPlotId,
  isValidImageId,
} from './validation';
