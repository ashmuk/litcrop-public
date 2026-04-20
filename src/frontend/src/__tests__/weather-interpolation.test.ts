import { describe, it, expect } from 'vitest';
import { interpolateWeatherTemplate } from '../lib/weather-i18n';

describe('interpolateWeatherTemplate', () => {
  it('returns the template untouched when params are undefined', () => {
    expect(interpolateWeatherTemplate('No placeholders here.', undefined, 'en')).toBe('No placeholders here.');
    expect(interpolateWeatherTemplate('Has {mm}mm.', undefined, 'en')).toBe('Has {mm}mm.');
  });

  it('substitutes numeric placeholders', () => {
    expect(
      interpolateWeatherTemplate('Heavy rainfall expected: {mm}mm on {date}.', { mm: 30.2, date: '2026-04-23' }, 'en'),
    ).toMatch(/Heavy rainfall expected: 30\.2mm on .+/);
  });

  it('formats the date in en-US for English locale', () => {
    const out = interpolateWeatherTemplate('Low: {low}°C on {date}.', { low: -1.5, date: '2026-04-23' }, 'en');
    // Expect e.g. "Low: -1.5°C on Apr 23."
    expect(out).toContain('-1.5°C');
    expect(out).toMatch(/Apr 23|April 23/);
  });

  it('formats the date in ja-JP for Japanese locale', () => {
    const out = interpolateWeatherTemplate('{date}に{mm}mmの大雨予報。', { mm: 30.2, date: '2026-04-23' }, 'ja');
    // Expect e.g. "4月23日に30.2mmの大雨予報。" — the date part uses ja-JP formatting.
    expect(out).toContain('4月');
    expect(out).toContain('23');
    expect(out).toContain('30.2');
    expect(out).not.toContain('2026-04-23'); // raw ISO should not remain
  });

  it('leaves unknown placeholders literal', () => {
    expect(
      interpolateWeatherTemplate('Unknown {foo} here.', { mm: 10 }, 'en'),
    ).toBe('Unknown {foo} here.');
  });

  it('handles partial params (some present, some missing)', () => {
    expect(
      interpolateWeatherTemplate('Low {low}°C, high {high}°C on {date}.', { low: 1, date: '2026-04-23' }, 'en'),
    ).toMatch(/Low 1°C, high \{high\}°C on .+/);
  });
});
