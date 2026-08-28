import { useCallback, useEffect, useState } from 'preact/hooks'

import { account } from '@fkn/lib'

export type AccountInfo = Awaited<ReturnType<typeof account.info>>

// info() waits on the broker iframe and carries no timeout of its own, so a broker that never answers
// would hold `ready` at false and render nothing at all. Resolving to null instead falls back to the
// connect button, which is the honest reading of "we could not tell whether you are signed in".
const readAccount = (): Promise<AccountInfo> =>
  Promise.race([
    account.info(),
    new Promise<AccountInfo>(resolve => setTimeout(() => resolve(null), 4_000))
  ])

export const useAccount = () => {
  const [info, setInfo] = useState<AccountInfo>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(
    // the catch deliberately leaves `info` alone: one failed read should not flash the header back to
    // signed-out for an account that is still connected
    () => readAccount().then(next => { setInfo(next); setReady(true) }).catch(() => setReady(true)),
    []
  )

  useEffect(() => {
    let cancelled = false
    const unsubscribe = account.onChange(() => { if (!cancelled) refresh() })
    refresh()
    // covers a subscription lapsing and anything else the broker does not push
    const id = window.setInterval(() => { if (!cancelled) refresh() }, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
      // onChange resolves to the unsubscribe function rather than being one
      unsubscribe.then(off => off()).catch(() => {})
    }
  }, [refresh])

  const logout = useCallback(async () => {
    await account.logout().catch(() => {})
    await refresh()
  }, [refresh])

  return { info, ready, logout }
}
