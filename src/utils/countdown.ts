/**
 * A duration as the largest units it actually uses, the way a broadcast countdown reads.
 *
 * `units` is how many of them to name: two gives "1 hour, 42 mins", one gives "1 hour". Empty units
 * are SKIPPED rather than padded, so an episode six days and forty-two minutes out reads
 * "6 days, 42 mins" and never "6 days, 0 hours".
 *
 * Answers `undefined` for a time that has already passed, which is the caller's signal to render
 * nothing: a stored schedule outlives the airing it describes by however long the source takes to
 * publish the next one.
 */
export const formatCountdown = (ms: number, units = 2): string | undefined => {
  if (!Number.isFinite(ms) || ms <= 0) return undefined

  const parts: string[] = []
  let rest = ms
  for (const unit of UNITS) {
    const count = Math.floor(rest / unit.ms)
    rest -= count * unit.ms
    if (!count) continue
    parts.push(`${count} ${count === 1 ? unit.singular : unit.plural}`)
    if (parts.length >= units) break
  }
  return parts.length ? parts.join(', ') : undefined
}

const UNITS = [
  { ms: 86_400_000, singular: 'day', plural: 'days' },
  { ms: 3_600_000, singular: 'hour', plural: 'hours' },
  { ms: 60_000, singular: 'min', plural: 'mins' },
  { ms: 1_000, singular: 'sec', plural: 'secs' },
] as const
