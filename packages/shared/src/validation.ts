/**
 * LitCrop shared validation utilities
 * Updated: Phase D — Farm→Bed flattening (ADR-20260322)
 */

import {
  ACCEPTED_IMAGE_CONTENT_TYPE,
  MAX_IMAGE_SIZE_BYTES,
  TAG_VALUES,
  BED_STATUS_VALUES,
  TRIGGER_TYPES,
} from './constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidImageContentType(type: string): boolean {
  return type === ACCEPTED_IMAGE_CONTENT_TYPE;
}

export function isValidImageSize(bytes: number): boolean {
  return Number.isInteger(bytes) && bytes > 0 && bytes <= MAX_IMAGE_SIZE_BYTES;
}

export function isValidTagValue(tag: string): boolean {
  return (TAG_VALUES as readonly string[]).includes(tag);
}

export function isValidBedStatus(status: string): boolean {
  return (BED_STATUS_VALUES as readonly string[]).includes(status);
}

/** @deprecated Use isValidBedStatus */
export const isValidPlotStatus = isValidBedStatus;

export function isValidTriggerType(type: string): boolean {
  return (TRIGGER_TYPES as readonly string[]).includes(type);
}

/** Validates latitude and longitude are within WGS-84 bounds */
export function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export const isValidFarmId = isValidUuid;
export const isValidBedId = isValidUuid;
export const isValidImageId = isValidUuid;

/** @deprecated Use isValidBedId */
export const isValidPlotId = isValidBedId;
