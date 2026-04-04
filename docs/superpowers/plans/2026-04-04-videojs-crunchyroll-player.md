# Video.js v10 Crunchyroll Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Crunchyroll's native player controls with a Video.js v10 React skin overlay, using the web extension's `VideoHandle` as the media backend.

**Architecture:** The Crunchyroll player loads crunchyroll.com in an iframe via `@fkn/lib`'s Frame. After login detection, we locate the `<video>` element, obtain a `VideoHandle` (sync getters, optimistic setters, event dispatching), wrap it with a thin `asMediaElement` adapter (adds `TimeRanges` shims for `buffered`/`seekable`), and pass it to a Video.js v10 store. The `@videojs/react` `VideoSkin` renders as an absolute overlay on top of the iframe. Native Crunchyroll controls are hidden via CSS injection.

**Tech Stack:** Preact 11 (via preact/compat aliases), @videojs/react 10.0.0-beta.14, @fkn/lib (Frame + VideoHandle), Emotion CSS-in-JS

**Spec:** `docs/superpowers/specs/2026-04-03-videojs-crunchyroll-player-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add @videojs/react dependency |
| `src/sources/crunchyroll/player.tsx` | Rewrite | Crunchyroll player with Video.js skin overlay |

---

### Task 1: Install Video.js v10 Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @videojs/react**

```bash
cd /home/banou/dev/stub && npm install @videojs/react@10.0.0-beta.14
```

This pulls in `@videojs/core`, `@videojs/store`, `@videojs/utils`, `@videojs/spf` as transitive dependencies. The only peer dependency is `react`, which is already aliased to `preact/compat` in `vite.config.ts`.

- [ ] **Step 2: Verify the install works with Vite**

```bash
cd /home/banou/dev/stub && npx vite build 2>&1 | tail -20
```

Expected: Build succeeds (or at least no resolution errors for @videojs packages). If there are Preact compat issues, they'll show up here.

- [ ] **Step 3: Commit**

```bash
cd /home/banou/dev/stub
git add package.json package-lock.json
git commit -m "feat: add @videojs/react v10 beta dependency"
```

---

### Task 2: Rewrite Crunchyroll Player with Video.js Skin

**Files:**
- Modify: `src/sources/crunchyroll/player.tsx`

**Context:** The current file (`src/sources/crunchyroll/player.tsx`) handles iframe creation, Frame connection, CSS injection, and login detection. We're keeping the iframe/Frame/login logic and adding: (1) CSS to hide native controls, (2) video handle connection after login, (3) Video.js skin overlay.

**Key imports the implementer needs to know about:**
- `@fkn/lib`: `newFrame` creates a Frame for iframe manipulation, `Frame` type for the ref. The Frame's `.locator('video')` returns a locator, and `.video()` on the locator returns `Promise<VideoHandle>`.
- `VideoHandle` type: exported from `@fkn/lib`. Has sync getters (`paused`, `currentTime`, `duration`, `volume`, `muted`, `playbackRate`, `ended`, `readyState`, `buffered`, `src`, `currentSrc`), optimistic setters (`currentTime`, `volume`, `muted`, `playbackRate`), methods (`play()`, `pause()`, `requestFullscreen()`), event methods (`addEventListener`, `removeEventListener`, `dispatchEvent`), and `[Symbol.dispose]()` for cleanup.
- `@videojs/react`: `createPlayer`, `useMediaAttach` from main entry
- `@videojs/react/video`: `VideoSkin`, `videoFeatures` from video preset

- [ ] **Step 1: Add the CSS rule to hide native Crunchyroll controls**

In `src/sources/crunchyroll/player.tsx`, append to the `CRUNCHYROLL_OUTER_CSS` string:

```ts
const CRUNCHYROLL_OUTER_CSS = `
  #onetrust-consent-sdk {
    display: none !important;
  }
  .video-player-wrapper, [class*="app-layout__content--"] {
    position: initial !important;
  }
  html {
    overflow: hidden !important;
  }
  html::before {
    content: '';
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 999999;
    pointer-events: none;
  }
  .video-player {
    position: absolute !important;
    inset: 0 !important;
    z-index: 9999999;
  }
  [data-testid="player-controls-root"] {
    display: none !important;
  }
`
```

The only change is appending the `[data-testid="player-controls-root"]` rule at the end.

- [ ] **Step 2: Add the asMediaElement adapter and Video.js setup at the top of the file**

Replace the imports and add the adapter. The full top section of the file should be:

```tsx
import type { Frame, VideoHandle } from '@fkn/lib'

import type { PlayerProps } from '../players'

import { css } from '@emotion/react'
import { newFrame } from '@fkn/lib'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { createPlayer, useMediaAttach } from '@videojs/react'
import { VideoSkin, videoFeatures } from '@videojs/react/video'

const { Provider } = createPlayer({ features: videoFeatures })

const toTimeRanges = (ranges: Array<{ start: number; end: number }>) => ({
  length: ranges.length,
  start: (i: number) => ranges[i]!.start,
  end: (i: number) => ranges[i]!.end,
})

const asMediaElement = (handle: VideoHandle) => Object.create(handle, {
  buffered: { get() { return toTimeRanges(handle.buffered) } },
  seekable: { get() { return toTimeRanges(handle.duration ? [{ start: 0, end: handle.duration }] : []) } },
  error: { value: null },
  load: { value: () => {} },
})
```

- [ ] **Step 3: Create the RemoteMediaProvider component**

Add this component after the `asMediaElement` function. It registers the adapted VideoHandle with the Video.js store:

```tsx
const RemoteMediaProvider = ({ media }: { media: ReturnType<typeof asMediaElement> }) => {
  const setMedia = useMediaAttach()
  useEffect(() => {
    setMedia?.(media)
    return () => { setMedia?.(null) }
  }, [media, setMedia])
  return null
}
```

- [ ] **Step 4: Create the VideoOverlay component**

Add this component after `RemoteMediaProvider`. It renders the Video.js skin positioned over the iframe:

```tsx
const VideoOverlay = ({ handle }: { handle: VideoHandle }) => {
  const media = asMediaElement(handle)
  return (
    <Provider>
      <RemoteMediaProvider media={media} />
      <div
        css={css`
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;

          & > * {
            pointer-events: auto;
          }
        `}
      >
        <VideoSkin />
      </div>
    </Provider>
  )
}
```

- [ ] **Step 5: Rewrite the CrunchyrollPlayer component**

Replace the existing `CrunchyrollPlayer` component with the new version. Keep the existing `CRUNCHYROLL_DOMAINS`, `CRUNCHYROLL_OUTER_CSS`, `CRUNCHYROLL_LOGIN_URL`, `waitForContentScript`, and `checkIsLoggedIn` functions unchanged. Only replace the component itself:

```tsx
const CrunchyrollPlayer = ({ url }: PlayerProps) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const frameRef = useRef<Frame>(undefined)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const [error, setError] = useState<string>()
  const [videoHandle, setVideoHandle] = useState<VideoHandle | null>(null)

  useEffect(() => {
    if (!iframe || frameRef.current) return
    let cancelled = false
    ;(async () => {
      const frame = await newFrame({
        iframe,
        domains: CRUNCHYROLL_DOMAINS
      })
      if (cancelled) return
      frameRef.current = frame
      await frame.goto(url, { waitUntil: 'documentstart' })
      await waitForContentScript(() => frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS }))
      if (cancelled) return
      setLoading(false)
      const isLoggedIn = await checkIsLoggedIn(frame)
      if (cancelled) return
      if (!isLoggedIn) {
        setLoggedOut(true)
        return
      }
      const handle = await frame.locator('video').video()
      if (cancelled) return
      setVideoHandle(handle)
    })().catch(err => {
      console.error(err)
      if (cancelled) return
      setLoading(false)
      setError(err?.message ?? 'Failed to load player')
    })
    return () => {
      cancelled = true
    }
  }, [iframe, url])

  useEffect(() => {
    if (!videoHandle) return
    return () => { videoHandle[Symbol.dispose]() }
  }, [videoHandle])

  const openLogin = useCallback(() => {
    const popup = globalThis.open(CRUNCHYROLL_LOGIN_URL, '_blank', 'width=500,height=700')
    if (!popup) return
    const interval = setInterval(() => {
      if (!popup.closed) return
      clearInterval(interval)
      frameRef.current = undefined
      setLoggedOut(false)
      setVideoHandle(null)
      setLoading(true)
    }, 500)
  }, [url])

  const overlay = (loggedOut || error || loading) && (
    <div
      css={css`
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.6rem;
        background: #000;
        border-radius: 0.8rem;
        font-size: 1.4rem;
        color: rgba(255, 255, 255, 0.8);
        z-index: 3;
      `}
    >
      {loggedOut && (
        <>
          You need to be logged in to Crunchyroll to watch this content.
          <button
            onClick={openLogin}
            css={css`
              padding: 0.8rem 2rem;
              background: #f47521;
              color: #fff;
              border: none;
              border-radius: 0.4rem;
              font-size: 1.4rem;
              font-weight: 600;
              cursor: pointer;
              &:hover {
                background: #e0651a;
              }
            `}
          >
            Open Crunchyroll Login Page
          </button>
        </>
      )}
      {error && !loggedOut && error}
      {loading && !error && !loggedOut && 'Loading Crunchyroll player...'}
    </div>
  )

  return (
    <div
      css={css`
        position: relative;
      `}
    >
      {overlay}
      {videoHandle && <VideoOverlay handle={videoHandle} />}
      <iframe
        ref={setIframe}
        referrerPolicy="no-referrer"
        allow="encrypted-media; autoplay; fullscreen;"
        css={css`
          width: 100%;
          aspect-ratio: 16 / 9;
          border: none;
          border-radius: 0.8rem;
          background: #000;
        `}
      />
    </div>
  )
}

export default CrunchyrollPlayer
export { CRUNCHYROLL_DOMAINS, CRUNCHYROLL_OUTER_CSS }
```

Key changes from the original:
- Added `videoHandle` state (`VideoHandle | null`)
- After login check passes, calls `frame.locator('video').video()` to get the handle
- Renders `<VideoOverlay>` when handle is available
- Separate `useEffect` for disposing the handle on cleanup
- Login overlay z-index bumped to `3` (above the VideoOverlay's `2`)
- `openLogin` callback also resets `videoHandle` to null

- [ ] **Step 6: Verify the build compiles**

```bash
cd /home/banou/dev/stub && npx vite build 2>&1 | tail -20
```

Expected: Build succeeds. Watch for:
- Import resolution errors for `@videojs/react` or `@videojs/react/video`
- TypeScript errors around `VideoHandle` type mismatches
- Preact compat issues with Video.js React components

- [ ] **Step 7: Commit**

```bash
cd /home/banou/dev/stub
git add src/sources/crunchyroll/player.tsx
git commit -m "feat: replace Crunchyroll native controls with Video.js v10 skin overlay"
```

---

### Task 3: Manual Testing & Fixes

**Files:**
- Possibly modify: `src/sources/crunchyroll/player.tsx`

This task is for live testing with a real Crunchyroll page. Start the dev server and navigate to a watch page with a Crunchyroll source.

- [ ] **Step 1: Start dev server**

```bash
cd /home/banou/dev/stub && npm run dev
```

- [ ] **Step 2: Test the player**

Open the app in the browser, navigate to a Crunchyroll episode. Verify:
1. Crunchyroll iframe loads and login detection works
2. After login, native Crunchyroll controls are hidden (`[data-testid="player-controls-root"]` rule working)
3. Video.js skin overlay appears with play/pause, time slider, volume, fullscreen controls
4. Play/pause works (clicking the Video.js play button controls the iframe video)
5. Time slider reflects current playback position and allows seeking
6. Volume slider works
7. Fullscreen button works (note: fullscreen may need to target the container rather than the iframe video — see risk #5 in spec)

- [ ] **Step 3: Fix any issues discovered during testing**

Common issues to watch for:
- **Video.js skin not visible:** Check z-index layering, ensure the overlay `div` is rendering. Check browser devtools for the Video.js skin container.
- **Controls not responding:** Verify `pointer-events` is correct — the overlay container should be `pointer-events: none` with `& > * { pointer-events: auto }`.
- **State not syncing:** Check browser console for errors from the VideoHandle stream. Verify events are being dispatched (add a temporary `video.addEventListener('timeupdate', () => console.log(video.currentTime))` to debug).
- **TimeRanges errors:** If Video.js features crash on `buffered`/`seekable`, the `toTimeRanges` shim may need to return a proper class instance instead of a plain object.
- **Preact compat issues:** If `@videojs/react` components don't render, check for React API calls that Preact doesn't support. May need to add specific shims.
- **CSS skin not loading:** The Video.js skin CSS may need to be explicitly imported. Try adding `import '@videojs/react/video/styles.css'` or check what CSS the `VideoSkin` component expects.

- [ ] **Step 4: Commit fixes**

```bash
cd /home/banou/dev/stub
git add src/sources/crunchyroll/player.tsx
git commit -m "fix: address issues from manual testing of Video.js Crunchyroll player"
```
