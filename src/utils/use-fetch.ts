import { useEffect, useState } from 'react'
import { fetch } from '@fkn/lib'

type RequestType = 'json' | 'arrayBuffer' | 'blob' | 'text' | 'formData' | undefined

type RequestTypeResponse<T> =
  T extends 'json' ? any
  : T extends 'arrayBuffer' ? ArrayBuffer
  : T extends 'blob' ? Blob
  : T extends 'text' ? string
  : T extends 'formData' ? FormData
  : T extends undefined ? ReadableStream<Uint8Array>
  : T extends any ? T
  : never

const defaultFetch = fetch

type Fetch<T = Response> = ((...args: Parameters<typeof fetch>) => Promise<T>)

interface UseFetchOptionsInterface<T extends RequestType> {
  type?: T
  fetch?: Fetch
  skip?: boolean
}

interface UseFetchReturn<T = undefined, T2 extends Function | Parameters<Fetch>[0] | undefined = Function | Parameters<Fetch>[0] | undefined, T3 extends RequestType = undefined> {
  loading: boolean
  error?: Error
  data?:
    T extends undefined
      ? (
        T2 extends (...args: any) => infer R ? Awaited<R>
        : T3 extends RequestType ? RequestTypeResponse<T3>
        : T2 extends RequestType ? RequestTypeResponse<T2>
        : never
      )
      : T
  refetch: () =>
    Promise<
      T extends undefined
        ? (
          T2 extends (...args: any) => infer R ? Awaited<R>
          : T3 extends RequestType ? RequestTypeResponse<T3>
          : T2 extends RequestType ? RequestTypeResponse<T2>
          : never
        )
        : T
    >
}

export const useFetch =
  <T = undefined, T2 extends Function | Parameters<Fetch>[0] | undefined = undefined | Function | Parameters<Fetch>[0], T3 extends RequestType = undefined>(
    input: T2,
    {
      type,
      skip = false,
      fetch = typeof input === 'function' ? input : defaultFetch,
      ...rest
    } : UseFetchOptionsInterface<T3> & Parameters<typeof fetch>[1] = {
      fetch: typeof input === 'function' ? input as Fetch : defaultFetch,
      skip: false
    }
  ): UseFetchReturn<T, T2, T3> => {
    const [request, setRequest] = useState(undefined)
    const [data, setData] = useState(undefined)
    const [error, setError] = useState(undefined)
    const loading = !!request

    const makeRequest = () =>
      (
        type
          ? fetch(type)(input, rest)
          : fetch(rest)
      )
        .then(setData)
        .catch(setError)
        .finally(() => setRequest(undefined))

    const refetch = makeRequest

    useEffect(() => {
      if (skip || loading || data) return
      setRequest(makeRequest)
    }, [skip])

    return {
      loading,
      error,
      data,
      refetch
    }
  }
