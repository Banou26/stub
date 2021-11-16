import { useEffect, useState } from 'react'
import { fetch } from '@mfkn/fkn-lib'

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
  refetch: Fetch
}

export const useFetch =
  <T = undefined, T2 extends Function | Parameters<Fetch>[0] | undefined = undefined | Function | Parameters<Fetch>[0], T3 extends RequestType = undefined>(
    input: T2,
    { type, fetch = defaultFetch, ...rest }: UseFetchOptionsInterface<T3> & Parameters<typeof fetch>[1] = { fetch: defaultFetch }
  ): UseFetchReturn<T, T2, T3> => {
    const [request, setRequest] = useState(undefined)
    const [data, setData] = useState(undefined)
    const [error, setError] = useState(undefined)
    const loading = !!request

    const makeRequest = () =>
      (
        type
          ? fetch(type)(input, rest)
          : fetch(input, rest)
      )
        .then(setData)
        .catch(setError)
        .finally(() => setRequest(undefined))

    const refetch = makeRequest

    useEffect(() => {
      setRequest(makeRequest)
    }, [])

    return {
      loading,
      error,
      data,
      refetch
    }
  }

// const { data } = useFetch('foobar')
// const dataOk: ReadableStream<Uint8Array> | undefined = data
// const { data: data2 } = useFetch('foobar', { type: 'text' })
// const data2Ok: string | undefined = data2
// const { data: data3 } = useFetch(() => new Promise<boolean>(() => {}))
// const data3Ok: boolean | undefined = data3
// const { data: data4 } = useFetch<{ foo: string }>('foobar')
// const data4Ok: { foo: string } | undefined = data4
