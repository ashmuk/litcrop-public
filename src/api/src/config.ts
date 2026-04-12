const raw = (process.env['ADMIN_EMAILS'] ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export const ADMIN_EMAILS_LIST: string[] = raw;
export const ADMIN_EMAILS_SET: Set<string> = new Set(raw);
