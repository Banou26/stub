import type { PartyMessage } from './protocol'
import type { PartyState } from './store'

import { useEffect, useState } from 'preact/hooks'

import { party } from './index'

/** The party's state, re-rendered as it moves. */
export const useParty = (): PartyState => {
  const [state, setState] = useState(party.getState)
  useEffect(() => party.subscribe(setState), [])
  return state
}

/**
 * What the host said, for a guest to act on.
 *
 * The listener is read through a ref on every message rather than re-subscribed on every render, so
 * a component can hand in a closure over its latest props without the subscription churning.
 */
export const usePartyMessages = (listener: (message: PartyMessage, replayed: boolean) => void) => {
  const [latest] = useState(() => ({ current: listener }))
  latest.current = listener
  useEffect(() => party.onMessage((message, replayed) => latest.current(message, replayed)), [])
}
