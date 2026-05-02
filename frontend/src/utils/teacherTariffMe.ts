/**
 * teacherTariffMe.ts
 *
 * Helpers for GET /api/v1/admin/tariffs/me payloads. Plan limits use singular
 * keys in `ai_limits` (e.g. exercise_generation); usage counters stay plural
 * in `ai_usage` (e.g. exercise_generations, course_publishes).
 */

// Reads a limit from ai_limits, preferring the canonical singular key used by the backend.
export function aiLimitFromMe(
  limits: Record<string, number | null | undefined> | null | undefined,
  singularKey: string,
  legacyPluralKey: string,
): number | null {
  if (!limits) return null;
  if (Object.prototype.hasOwnProperty.call(limits, singularKey)) {
    const v = limits[singularKey];
    return v === undefined ? null : v;
  }
  if (Object.prototype.hasOwnProperty.call(limits, legacyPluralKey)) {
    const v = limits[legacyPluralKey];
    return v === undefined ? null : v;
  }
  return null;
}
