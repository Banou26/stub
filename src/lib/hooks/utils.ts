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
  : never

const defaultFetch = fetch

type Fetch<T = Response> = ((...args: Parameters<typeof fetch>) => Promise<T>)

interface UseFetchOptionsInterface<T extends RequestType> {
  type?: T
  fetch?: Fetch
}

type UseFetchOptions<T extends RequestType> = UseFetchOptionsInterface<T> & Parameters<typeof fetch>[1]

// interface UseFetchReturn<T extends RequestType> {
//   loading: boolean
//   error?: Error
//   data?: RequestTypeResponse<T>
//   refetch: Fetch
// }

interface UseFetchReturn<T, T2 extends Function | Parameters<Fetch>[0] | undefined = Function | Parameters<Fetch>[0] | undefined, T3 extends RequestType = undefined> {
  loading: boolean
  error?: Error
  data?:
    T extends (T extends unknown ? never : T) ? T
    : T2 extends (...args: any) => infer R ? Awaited<R>
    : T3 extends RequestType ? RequestTypeResponse<T3>
    : T2 extends RequestType ? RequestTypeResponse<T2>
    : RequestTypeResponse<undefined>
  refetch: Fetch
}

export const useFetch =
  <T, T2 extends Function | Parameters<Fetch>[0] | undefined = undefined | Function | Parameters<Fetch>[0], T3 extends RequestType = undefined>(
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

type foo = Parameters<Fetch>[0]

const { data } = useFetch('foobar')
// data: ReadableStream<Uint8Array> | undefined
const { data: data2 } = useFetch('foobar', { type: 'text' })
// data: string | undefined
const { data: data3 } = useFetch(() => new Promise<boolean>(() => {}))
// data: boolean | undefined
const { data: data4 } = useFetch<{ foo: string }>('foobar')
// rn its ReadableStream<Uint8Array> but i want
// data: { foo: string } | undefined
