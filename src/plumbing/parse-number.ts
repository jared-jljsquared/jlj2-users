/**
 * Safely parse a string to a number. Returns fallback for empty, invalid, or non-finite values.
 */
export const parseNumber = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return parsed
}
