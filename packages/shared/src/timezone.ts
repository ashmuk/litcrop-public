/**
 * Timezone approximation utilities.
 *
 * Uses longitude-based estimation (±15° per UTC hour) to derive a UTC offset
 * string from geographic coordinates. This is a rough approximation suitable
 * for MVP date formatting — it does not account for political timezone
 * boundaries or DST.
 *
 * Example: Nagano, Japan (longitude ≈ 138°) → Math.round(138/15) = 9 → "+09:00"
 */

/**
 * Returns an approximate UTC offset string (e.g. "+09:00", "-05:00", "+00:00")
 * derived from the given longitude.
 *
 * @param lng - Longitude in decimal degrees (-180 to +180)
 */
export function getTimezoneOffsetFromCoords(lng: number): string {
  const offsetHours = Math.round(lng / 15);
  const clampedOffset = Math.max(-12, Math.min(14, offsetHours));
  const sign = clampedOffset >= 0 ? '+' : '-';
  const absHours = Math.abs(clampedOffset).toString().padStart(2, '0');
  return `${sign}${absHours}:00`;
}
