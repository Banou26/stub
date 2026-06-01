type StoreEventMap = {
  'media:changed': { uris?: string[] }
  'episode:changed': { uris?: string[] }
  'origin:changed': { ids?: string[] }
}

const eventBus = new EventTarget()

export function emit<K extends keyof StoreEventMap>(
  type: K,
  detail: StoreEventMap[K]
): void {
  eventBus.dispatchEvent(new CustomEvent(type, { detail }))
}

function listen<K extends keyof StoreEventMap>(
  type: K,
  callback: (detail: StoreEventMap[K]) => void
): () => void {
  const handler = (e: Event) => callback((e as CustomEvent).detail)
  eventBus.addEventListener(type, handler)
  return () => eventBus.removeEventListener(type, handler)
}

// ─── Async iterator factory ──────────────────────────────────────────────────

type IteratorOptions = { abortSignal?: AbortSignal }

function makeAsyncIterator<T>(
  subscribe: (fire: () => void) => () => void,
  value: T,
  options?: IteratorOptions
): AsyncIterableIterator<T> {
  let resolve: ((result: IteratorResult<T>) => void) | null = null
  let pending = false

  const fire = () => {
    if (resolve) {
      resolve({ value, done: false })
      resolve = null
    } else {
      pending = true
    }
  }

  const cleanup = subscribe(fire)

  if (options?.abortSignal) {
    options.abortSignal.addEventListener('abort', () => {
      cleanup()
      if (resolve) resolve({ value: undefined as T, done: true })
    })
  }

  return {
    async next() {
      if (pending) {
        pending = false
        return { value, done: false as const }
      }
      return new Promise<IteratorResult<T>>(r => { resolve = r })
    },
    async return() {
      cleanup()
      return { value: undefined as T, done: true as const }
    },
    [Symbol.asyncIterator]() { return this },
  }
}

// ─── Public iterators ────────────────────────────────────────────────────────

export function listenIterator<K extends keyof StoreEventMap>(
  type: K,
  options?: IteratorOptions
): AsyncIterableIterator<StoreEventMap[K]> {
  let resolve: ((result: IteratorResult<StoreEventMap[K]>) => void) | null = null
  const buffer: StoreEventMap[K][] = []

  const unlisten = listen(type, (detail) => {
    if (resolve) {
      resolve({ value: detail, done: false })
      resolve = null
    } else {
      buffer.push(detail)
    }
  })

  if (options?.abortSignal) {
    options.abortSignal.addEventListener('abort', () => {
      unlisten()
      if (resolve) resolve({ value: undefined as any, done: true })
    })
  }

  return {
    async next() {
      if (buffer.length > 0) {
        return { value: buffer.shift()!, done: false as const }
      }
      return new Promise<IteratorResult<StoreEventMap[K]>>(r => { resolve = r })
    },
    async return() {
      unlisten()
      return { value: undefined as any, done: true as const }
    },
    [Symbol.asyncIterator]() { return this },
  }
}

export function listenMultipleIterator(
  types: (keyof StoreEventMap)[],
  options?: IteratorOptions
): AsyncIterableIterator<void> {
  return makeAsyncIterator(
    (fire) => {
      const unlisteners = types.map(type => listen(type, fire))
      return () => unlisteners.forEach(u => u())
    },
    undefined as void,
    options
  )
}

export function debouncedListenIterator(
  types: (keyof StoreEventMap)[],
  debounceMs: number,
  options?: IteratorOptions
): AsyncIterableIterator<void> {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return makeAsyncIterator(
    (fire) => {
      const unlisteners = types.map(type =>
        listen(type, () => {
          if (timeout) clearTimeout(timeout)
          timeout = setTimeout(fire, debounceMs)
        })
      )
      return () => {
        if (timeout) clearTimeout(timeout)
        unlisteners.forEach(u => u())
      }
    },
    undefined as void,
    options
  )
}
