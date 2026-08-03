import { useEffect, useState } from 'preact/hooks'

const probeResults = new Map<string, Promise<boolean>>()
const FAILED_PROBE_TTL_MS = 30_000

const probe = (url: string) => {
  const existing = probeResults.get(url)
  if (existing) return existing
  const result = new Promise<boolean>(resolve => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => {
      setTimeout(() => probeResults.delete(url), FAILED_PROBE_TTL_MS)
      resolve(false)
    }
    image.src = url
  })
  probeResults.set(url, result)
  return result
}

export const useCoverUrl = (covers: ({ url: string } | null | undefined)[] | null | undefined) => {
  const urls = (covers ?? []).map(cover => cover?.url).filter((url): url is string => Boolean(url))
  const key = urls.join('|')
  const [url, setUrl] = useState<string | undefined>(urls[0])

  useEffect(() => {
    let cancelled = false
    setUrl(urls[0])
    ;(async () => {
      for (const candidate of urls) {
        const loaded = await probe(candidate)
        if (cancelled) return
        if (loaded) {
          setUrl(candidate)
          return
        }
      }
    })()
    return () => { cancelled = true }
  }, [key])

  return url
}
