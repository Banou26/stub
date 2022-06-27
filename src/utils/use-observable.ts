import { useEffect, useMemo, useState } from 'react'
import { Observable } from 'rxjs'

export const useObservable = <T>(func: () => Observable<T>, deps: any[]) => {
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [value, setValue] = useState<T | undefined>(undefined)
  const observable = useMemo(func, deps)

  useEffect(() => {
    const subscription = observable.subscribe({
      complete: () => setCompleted(true),
      error: setError,
      next: setValue
    })
    return () => {
      subscription.unsubscribe()
      setCompleted(false)
      setError(undefined)
      setValue(undefined)
    }
  }, deps)

  return {
    observable,
    completed,
    error,
    value
  }
}

export default useObservable
