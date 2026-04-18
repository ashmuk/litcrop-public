import { describe, it, expect } from 'vitest';
import { wifiBarCount } from '../components/DeviceHealthIndicators';
import { formatBytes } from '../lib/format';

describe('wifiBarCount', () => {
  // Industry-standard RSSI tiers: excellent ≥ -55, good ≥ -65, fair ≥ -75,
  // weak ≥ -85, none otherwise. Regression guards here keep a future
  // "make the thresholds match a phone's more optimistic mapping" tweak
  // from silently flipping a critical-signal device into "fair".
  it('returns 4 bars for excellent signal (>= -55 dBm)', () => {
    expect(wifiBarCount(-30)).toBe(4);
    expect(wifiBarCount(-54)).toBe(4);
    expect(wifiBarCount(-55)).toBe(4);
  });

  it('returns 3 bars for good signal (-56..-65 dBm)', () => {
    expect(wifiBarCount(-56)).toBe(3);
    expect(wifiBarCount(-65)).toBe(3);
  });

  it('returns 2 bars for fair signal (-66..-75 dBm)', () => {
    expect(wifiBarCount(-66)).toBe(2);
    expect(wifiBarCount(-75)).toBe(2);
  });

  it('returns 1 bar for weak signal (-76..-85 dBm)', () => {
    expect(wifiBarCount(-76)).toBe(1);
    expect(wifiBarCount(-85)).toBe(1);
  });

  it('returns 0 bars for very weak or no signal', () => {
    expect(wifiBarCount(-86)).toBe(0);
    expect(wifiBarCount(-120)).toBe(0);
    expect(wifiBarCount(null)).toBe(0);
    expect(wifiBarCount(undefined)).toBe(0);
  });

  it('handles non-finite input defensively', () => {
    expect(wifiBarCount(Number.NaN)).toBe(0);
    expect(wifiBarCount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('formatBytes', () => {
  // Precision scales down with magnitude — these expectations lock in the
  // decision so a "pretty up the bytes" refactor can't flip 18.27 GB into
  // "18 GB" and quietly lose a meaningful digit at the small-capacity end.
  it('returns "—" for null/undefined/invalid', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-5)).toBe('—');
  });

  it('formats bytes under 1 KiB as raw bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes with 2 decimals under 10, 1 under 100, 0 above', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 9.8)).toBe('9.80 KB');
    expect(formatBytes(1024 * 50)).toBe('50.0 KB');
    expect(formatBytes(1024 * 512)).toBe('512 KB');
  });

  it('formats megabytes and gigabytes cleanly', () => {
    expect(formatBytes(1024 ** 2)).toBe('1.00 MB');
    expect(formatBytes(1024 ** 2 * 256)).toBe('256 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB');
    expect(formatBytes(1024 ** 3 * 18.27)).toBe('18.3 GB');
    expect(formatBytes(1024 ** 3 * 64)).toBe('64.0 GB');
  });

  it('caps at TB without leaking arbitrary-precision noise', () => {
    expect(formatBytes(1024 ** 4)).toBe('1.00 TB');
    expect(formatBytes(1024 ** 4 * 2.5)).toBe('2.50 TB');
  });
});
