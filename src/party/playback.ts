import type { PlaybackState } from './protocol'

// How a follower's player is moved to match the host's. Pure and import-free so the tolerance can be
// pinned: it is the one number that decides between a follower that stutters every heartbeat and
// one that drifts.

/**
 * The gap past which a follower seeks to the host's position, in seconds.
 *
 * Under it nothing is touched: the host's heartbeat arrives every few seconds, transit is a few
 * hundred milliseconds at most, and seeking a player that is already within a second of the host
 * would buy nothing and cost a visible stall each time. Over it the follower has fallen behind, or
 * the host seeked, and either way the honest move is to jump.
 */
export const SEEK_TOLERANCE_S = 1.5

/** How often the host's player reports while it plays, so a follower that drifts is corrected. */
export const HEARTBEAT_MS = 5_000

/** The local player, as much of it as the correction reads. */
export type LocalPlayback = { paused: boolean, time: number, rate: number }

/** What to do to a local player so it matches `wanted`. Each field is present only when it has to change. */
export type PlaybackCorrection = { seek?: number, play?: true, pause?: true, rate?: number }

/**
 * Where the host's player IS now, from where it said it was.
 *
 * `at` is the host's clock and `now` is the follower's, so their difference is skew plus transit,
 * and nothing here can tell those apart. It is applied anyway, capped: a report a few hundred
 * milliseconds old is moved forward by that much, which is right whenever the clocks agree, and a
 * report that looks older than the cap is treated as arriving just now, which is right when they do
 * not. Paused players do not move.
 */
export const expectedTime = (state: PlaybackState, now: number): number => {
  if (state.paused) return state.time
  const elapsed = Math.min(Math.max(now - state.at, 0), MAX_TRANSIT_MS) / 1000
  return state.time + elapsed * state.rate
}

const MAX_TRANSIT_MS = 2_000

export const playbackCorrection = (local: LocalPlayback, wanted: PlaybackState, now: number): PlaybackCorrection => {
  const correction: PlaybackCorrection = {}
  const target = expectedTime(wanted, now)
  if (Math.abs(local.time - target) > SEEK_TOLERANCE_S) correction.seek = target
  if (wanted.paused && !local.paused) correction.pause = true
  if (!wanted.paused && local.paused) correction.play = true
  if (Math.abs(local.rate - wanted.rate) > 0.001) correction.rate = wanted.rate
  return correction
}
