import type { Farm, Bed, Image, Tag, TagValue, BedStatus, FarmRole, FarmMember, UserProfile, Locale, TempUnit, Theme } from '@litcrop/shared';
import { TABLE_NAME, pk, sk } from './_infrastructure';
import type { UserSettings } from './_types';
import { DEFAULT_SETTINGS } from './_types';

export function itemToFarm(item: Record<string, unknown>, farmId: string): Farm {
  return {
    id: farmId,
    user_id: (item['user_id'] as string) ?? '',
    name: item['name'] as string,
    description: item['description'] as string | undefined,
    location_text: (item['location_text'] as string) ?? '',
    latitude: item['latitude'] as number | undefined,
    longitude: item['longitude'] as number | undefined,
    elevation_m: item['elevation_m'] as number | undefined,
    climate_zone: item['climate_zone'] as string | undefined,
    locale: (item['locale'] as Farm['locale']) ?? 'en',
    theme: (item['theme'] as Farm['theme']) ?? 'system',
    grid_rows: (item['grid_rows'] as number) ?? 1,
    grid_cols: (item['grid_cols'] as number) ?? 1,
    created_at: item['created_at'] as string,
    default_currency: (item['default_currency'] as Farm['default_currency']) ?? 'JPY',
  };
}

export function itemToBed(item: Record<string, unknown>, farmId: string, bedId: string): Bed {
  return {
    id: bedId,
    farm_id: farmId,
    row: item['row'] as number,
    col: item['col'] as number,
    name: item['name'] as string,
    crop_type: item['crop_type'] as string | undefined,
    crop_variety: item['crop_variety'] as string | undefined,
    planted_at: item['planted_at'] as string | undefined,
    expected_harvest: item['expected_harvest'] as string | undefined,
    notes: item['notes'] as string | undefined,
    latest_status: (item['latest_status'] as BedStatus) ?? 'no_data',
    completed_at: item['completed_at'] as string | undefined,
  };
}

export function itemToImage(item: Record<string, unknown>, imageId: string): Image {
  return {
    id: imageId,
    bed_id: item['bed_id'] as string,
    node_id: item['node_id'] as string,
    captured_at: item['captured_at'] as string,
    uploaded_at: item['uploaded_at'] as string,
    storage_key: item['storage_key'] as string,
    thumbnail_key: item['thumbnail_key'] as string | undefined,
    trigger: item['trigger'] as Image['trigger'],
    content_type: item['content_type'] as string,
    size_bytes: item['size_bytes'] as number,
    metadata: item['metadata'] as Record<string, unknown> | undefined,
  };
}

export function itemToTag(item: Record<string, unknown>, tagId: string): Tag {
  return {
    id: tagId,
    image_id: item['image_id'] as string,
    tag: item['tag'] as TagValue,
    note: item['note'] as string | undefined,
    created_at: item['created_at'] as string,
  };
}

export function itemToFarmMember(userId: string, item: Record<string, unknown>): FarmMember {
  return {
    user_id: userId,
    farm_id: item['farm_id'] as string,
    role: item['role'] as FarmRole,
    joined_at: item['joined_at'] as string,
  };
}

export function itemToUserProfile(item: Record<string, unknown>, userId: string): UserProfile {
  return {
    user_id: userId,
    display_name: (item['display_name'] as string) ?? '',
    preferred_role: (item['preferred_role'] as UserProfile['preferred_role']) ?? 'staff',
    created_at: (item['created_at'] as string) ?? '',
    profile_picture_key: item['profile_picture_key'] as string | undefined,
    profile_picture_thumb_key: item['profile_picture_thumb_key'] as string | undefined,
  };
}

export function itemToUserSettings(item: Record<string, unknown>): UserSettings {
  return {
    locale: (item['locale'] as Locale) ?? DEFAULT_SETTINGS.locale,
    temp_unit: (item['temp_unit'] as TempUnit) ?? DEFAULT_SETTINGS.temp_unit,
    theme: (item['theme'] as Theme) ?? DEFAULT_SETTINGS.theme,
    updated_at: (item['updated_at'] as string) ?? '',
  };
}

export function buildMembershipItems(userId: string, farmId: string, role: FarmRole, joinedAt: string) {
  return [
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: pk.user(userId),
          SK: sk.farmMember(farmId),
          farm_id: farmId,
          role,
          joined_at: joinedAt,
        },
      },
    },
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: pk.farm(farmId),
          SK: sk.member(userId),
          user_id: userId,
          role,
          joined_at: joinedAt,
        },
      },
    },
  ];
}
