import type { Locale, Theme, TempUnit } from '@litcrop/shared';

/** Serializable message record for DynamoDB storage. Matches MessageParam shape. */
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: unknown; // string | content block array (MessageParam['content'])
}

export interface UserSettings {
  locale: Locale;
  temp_unit: TempUnit;
  theme: Theme;
  updated_at: string;
}

export interface NotificationPrefs {
  prefs: Record<string, boolean>;  // keys are AppEventType values
  updated_at: string;
}

export interface DeleteAccountSummary {
  farms_deleted: string[];
  farms_left: string[];
  farms_transferred: Array<{ farm_id: string; new_admin: string }>;
  join_requests_deleted: number;
  profile_deleted: boolean;
  settings_deleted: boolean;
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'updated_at'> = {
  locale: 'en',
  temp_unit: 'C',
  theme: 'earthy',
};
