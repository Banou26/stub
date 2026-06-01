// Client-safe registry of sources that need a user-supplied API key (BYOK). Kept separate
// from the extractors — which import seal-wasm — so the settings page can read it on the
// main thread without pulling the worker/WASM bundle. Each keyful extractor reads its key
// via ctx.key(origin); this just describes the key to the settings UI.

export interface KeyConfig {
  origin: string
  name: string
  label: string
  getUrl: string
  help?: string
}

export const keyConfigs: KeyConfig[] = [
  {
    origin: 'omdb',
    name: 'OMDb',
    label: 'OMDb API key',
    getUrl: 'https://www.omdbapi.com/apikey.aspx',
    help: 'Free tier: 1,000 requests/day — choose the "FREE" account type on the form.',
  },
]
