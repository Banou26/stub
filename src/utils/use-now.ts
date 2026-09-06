import { useEffect, useState } from 'preact/hooks'

const TICK_MS = 30_000

// ONE timer for the whole page, not one per card. A results page renders fifty countdowns, and fifty
// intervals would also drift apart, so two cards a minute out could disagree about the minute.
const subscribers = new Set<(now: number) => void>()
let timer: ReturnType<typeof setInterval> | undefined

/** The current time, re-read every half minute, which is the resolution a countdown is rendered at. */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    subscribers.add(setNow)
    timer ??= setInterval(() => {
      const tick = Date.now()
      for (const subscriber of subscribers) subscriber(tick)
    }, TICK_MS)

    return () => {
      subscribers.delete(setNow)
      if (subscribers.size || !timer) return
      clearInterval(timer)
      timer = undefined
    }
  }, [])

  return now
}
