import { useEffect, useState } from 'react'

const useNamespacedLocalStorage = <T extends { [key: PropertyKey]: string | boolean | number | undefined | null | object | any[] }>(namespace: string) => {
  const [state, setState] = useState<T>(() => {
    const storedValue = localStorage.getItem(namespace)
    return (
      storedValue
        ? JSON.parse(storedValue)
        : {}
    )
  })

  useEffect(() => {
    localStorage.setItem(namespace, JSON.stringify(state));
  }, [namespace, state])

  return <T2 extends keyof T, T3 extends T[T2]>(key: T2, value: T[T2]) => {
    useEffect(() => {
      setState(state => ({ ...state, [key]: value }))
    }, [])
    return [
      state[key],
      (newValue: T3 | ((oldValue: T3) => T3)) =>
        typeof newValue === 'function'
          // @ts-expect-error
          ? setState(state => ({ ...state, [key]: newValue(state[key]) }))
          : setState(state => ({ ...state, [key]: newValue }))
    ] as const
  }
}

export default useNamespacedLocalStorage
