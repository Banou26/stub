/**
 * A `#rgb` or `#rrggbb` colour as `rgba(...)` at the given alpha, or nothing.
 *
 * Sources publish a cover's average colour as a hex string and nothing else, so every tint derived
 * from it has to be built here rather than by CSS: `color-mix` would do it, but only against a
 * colour the stylesheet already knows, and this one arrives per media at render time.
 *
 * Anything that is not a hex triplet answers `undefined`, which is what a media with no cover colour
 * says, so a caller falls back the same way for a missing value and a malformed one.
 */
export const hexToRgba = (hex: string | null | undefined, alpha: number): string | undefined => {
  if (!hex) return undefined
  const digits = hex.trim().replace(/^#/, '')
  const full =
    digits.length === 3 ? digits.split('').map(digit => digit + digit).join('')
    : digits.length === 6 ? digits
    : undefined
  if (!full || !/^[0-9a-f]{6}$/i.test(full)) return undefined

  const value = parseInt(full, 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/**
 * The three custom properties a media's own accent supplies to a card or a row.
 *
 * One helper rather than three call sites, because the fallbacks matter as much as the values: only
 * AniList publishes a cover colour, so a media the other sources answered has none and every surface
 * built on it has to stay legible without one.
 */
export const accentVars = (color: string | null | undefined) => ({
  '--accent': hexToRgba(color, 1) ?? 'rgba(255, 255, 255, 0.75)',
  '--accent-soft': hexToRgba(color, 0.18) ?? 'rgba(255, 255, 255, 0.08)',
  '--accent-wash': hexToRgba(color, 0.07) ?? 'rgba(255, 255, 255, 0.03)',
}) as Record<string, string>
