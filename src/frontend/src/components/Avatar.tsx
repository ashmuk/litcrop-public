/**
 * Avatar — Beta-5 (T-B5-11)
 *
 * Shared avatar component with three sizes. Displays profile picture
 * thumbnail when available, falls back to deterministic-colored initials.
 *
 * Sizes: hero (96px, 2-char), list (32px, 1-char), admin (28px, 1-char)
 *
 * Initials fallback uses one of 8 deterministic color pairs selected
 * by hashing the userId. Colors are applied via inline style because
 * they vary per-instance (CSS classes can't express N dynamic variants).
 * The border uses var(--color-gray-300) to respect theme.
 */

interface Props {
  displayName: string;
  thumbUrl: string | null;
  size: 'hero' | 'list' | 'admin';
  userId?: string;
}

const SIZE_MAP = {
  hero: { px: 96, fontSize: 36, chars: 2 },
  list: { px: 32, fontSize: 14, chars: 1 },
  admin: { px: 28, fontSize: 12, chars: 1 },
} as const;

/**
 * 8 muted color pairs for initials fallback.
 * These use the same semantic palette as status badges — chosen to
 * maintain adequate contrast (>4.5:1) on both light and dark surfaces.
 */
const PALETTE = [
  { bg: 'var(--color-primary-light)', fg: 'var(--color-primary)' },
  { bg: 'var(--color-status-healthy-bg)', fg: 'var(--color-status-healthy)' },
  { bg: 'var(--color-status-slow-growth-bg)', fg: 'var(--color-status-slow-growth)' },
  { bg: 'var(--color-status-issue-bg)', fg: 'var(--color-status-issue)' },
  { bg: 'var(--color-status-animal-bg)', fg: 'var(--color-status-animal)' },
  { bg: 'var(--color-status-no-data-bg)', fg: 'var(--color-status-no-data)' },
  { bg: 'var(--color-motion-bg)', fg: 'var(--color-motion)' },
  { bg: 'var(--color-gray-100)', fg: 'var(--color-gray-700)' },
];

function getInitials(displayName: string, charCount: number): string {
  const trimmed = displayName.trim();
  if (!trimmed) return 'U';

  if (charCount === 1) {
    const first = trimmed[0];
    return /\d/.test(first) ? 'U' : first.toUpperCase();
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function getColorIndex(userId?: string): number {
  if (!userId) return 0;
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTE.length;
}

export default function Avatar({ displayName, thumbUrl, size, userId }: Props) {
  const { px, fontSize, chars } = SIZE_MAP[size];
  const color = PALETTE[getColorIndex(userId)];
  const initials = getInitials(displayName, chars);

  const base = `width:${px}px;height:${px}px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border:2px solid var(--color-gray-300)`;

  if (thumbUrl) {
    return (
      <div style={base} role="img" aria-label={`${displayName} avatar`}>
        <img
          src={thumbUrl}
          alt=""
          style="width:100%;height:100%;object-fit:cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      style={`${base};background:${color.bg};color:${color.fg};font-size:${fontSize}px;font-weight:700`}
      role="img"
      aria-label={`${displayName} avatar`}
    >
      {initials}
    </div>
  );
}
