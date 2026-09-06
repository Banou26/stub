// How far the host's clock is from this one, measured rather than assumed.
//
// Every playback message carries the host's `at`, and a follower has to turn that into a position on
// its own clock. The difference between the two clocks is skew PLUS transit, and nothing in a single
// message can separate them: a state stamped a second ago on a clock two seconds fast looks exactly
// like a state stamped three seconds ago. So the follower asks, and times the round trip.
//
// This is Cristian's algorithm, the same arithmetic NTP starts from. Pure and import-free so it can
// be tested: the store that runs the exchange reaches @fkn/lib.

/** One round trip: what it cost, and what it says the host's clock reads relative to ours. */
export type ClockSample = {
  /** the round trip in milliseconds; the lower it is, the tighter the bound on the offset */
  rtt: number
  /** add this to a local timestamp to get the host's clock */
  offset: number
}

/**
 * A sample from one exchange.
 *
 * `sent` and `received` are this clock's, `hostAt` is the host's at the moment it replied. The host's
 * reply happened somewhere inside our round trip, and with no more information than this the best
 * estimate is the middle: the error is bounded by half the round trip, whatever the asymmetry.
 */
export const clockSample = (sent: number, hostAt: number, received: number): ClockSample => ({
  rtt: received - sent,
  offset: hostAt - (sent + received) / 2,
})

/**
 * The sample to believe out of several: the FASTEST round trip, not the average.
 *
 * The error in a sample is bounded by half its round trip, so the quickest exchange is the most
 * accurate one and averaging it with slower ones can only widen the bound. This is what NTP does and
 * for the same reason: a delayed packet is asymmetric in an unknown direction, and one that was not
 * delayed is not.
 */
export const bestSample = (samples: readonly ClockSample[]): ClockSample | undefined =>
  samples.length ? samples.reduce((best, sample) => sample.rtt < best.rtt ? sample : best) : undefined

/**
 * A host timestamp on this clock, and back.
 *
 * With no offset measured yet these are the identity, which is what makes a follower that has not
 * finished its first exchange behave exactly as one did before any of this existed.
 */
export const toLocalTime = (hostAt: number, offset: number): number => hostAt - offset
export const toHostTime = (localAt: number, offset: number): number => localAt + offset

/** A round trip slower than this says more about the network than about the clock, so it is not kept. */
export const MAX_USABLE_RTT_MS = 4_000
