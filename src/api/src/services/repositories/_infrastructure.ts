import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';

// ── Configuration ────────────────────────────────────────────────

export const TABLE_NAME = process.env.TABLE_NAME ?? 'litcrop-dev';
if (!process.env.TABLE_NAME) console.warn('[dynamodb] TABLE_NAME not set, falling back to litcrop-dev');
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
export const GSI1_INDEX = 'GSI1';

// ── Client ───────────────────────────────────────────────────────

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
export const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Key builders ─────────────────────────────────────────────────

export const pk = {
  farm: (farmId: string) => `${DDB_KEY_PREFIXES.FARM}${farmId}`,
  bed: (bedId: string) => `${DDB_KEY_PREFIXES.BED}${bedId}`,
  image: (imageId: string) => `${DDB_KEY_PREFIXES.IMG}${imageId}`,
  tag: (tagId: string) => `${DDB_KEY_PREFIXES.TAG}${tagId}`,
  user: (userId: string) => `${DDB_KEY_PREFIXES.USER}${userId}`,
};

export const sk = {
  meta: () => DDB_KEY_PREFIXES.META,
  profile: () => '#PROFILE',
  bed: (row: number, col: number, bedId: string) =>
    `${DDB_KEY_PREFIXES.BED}${row.toString().padStart(2, '0')}#${col.toString().padStart(2, '0')}#${bedId}`,
  image: (capturedAt: string, imageId: string) => `${DDB_KEY_PREFIXES.IMG}${capturedAt}#${imageId}`,
  tag: (createdAt: string, tagId: string) => `${DDB_KEY_PREFIXES.TAG}${createdAt}#${tagId}`,
  farmMember: (farmId: string) => `${DDB_KEY_PREFIXES.FARM_MEMBER}${farmId}`,
  member: (userId: string) => `${DDB_KEY_PREFIXES.MEMBER}${userId}`,
  settings: () => DDB_KEY_PREFIXES.SETTINGS,
  joinRequest: (userId: string) => `${DDB_KEY_PREFIXES.JOIN_REQUEST}${userId}`,
  device: (deviceId: string) => `${DDB_KEY_PREFIXES.DEVICE}${deviceId}`,
  diary: (date: string, entryId: string) => `${DDB_KEY_PREFIXES.DIARY}${date}#${entryId}`,
  notif: (createdAt: string, notifId: string) => `${DDB_KEY_PREFIXES.NOTIF}${createdAt}#${notifId}`,
  /** BedCrop primary SK: CROP#<bedId>#<bedCropId> (#279 Wave B). */
  crop: (bedId: string, bedCropId: string) => `${DDB_KEY_PREFIXES.CROP}${bedId}#${bedCropId}`,
  /** BedCrop GSI1SK: CROP#<bedCropId> (#279 Wave B). Disambiguates the bed's #META row. */
  cropGsi1: (bedCropId: string) => `${DDB_KEY_PREFIXES.CROP}${bedCropId}`,
};

// ── Pagination helpers ────────────────────────────────────────────

export function encodeCursor(lastKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastKey)).toString('base64url');
}

export function decodeCursor(cursor: string, expectedPkPrefix: string): Record<string, unknown> {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  // S4: Validate decoded PK matches the caller's expected prefix to prevent
  // cross-user data access via crafted cursors.
  const pkVal = decoded['PK'];
  if (typeof pkVal !== 'string' || !pkVal.startsWith(expectedPkPrefix)) {
    const err = new Error('Invalid cursor: PK mismatch');
    err.name = 'ValidationException';
    throw err;
  }
  return decoded;
}

// ── Utilities ─────────────────────────────────────────────────────

/** Extract entity ID from a composite key, e.g. "BED#01#01#<id>" → "<id>" */
export function extractIdFromSk(skValue: string, prefix: string): string {
  const withoutPrefix = skValue.slice(prefix.length);
  // For keys with position padding: "01#01#<uuid>", extract uuid after last #
  const lastHash = withoutPrefix.lastIndexOf('#');
  return lastHash >= 0 ? withoutPrefix.slice(lastHash + 1) : withoutPrefix;
}

/** Generate a bed name from row/col: row 1='A', 2='B', etc. + col number */
export function bedName(row: number, col: number): string {
  return `${String.fromCharCode(64 + row)}${col}`;
}
