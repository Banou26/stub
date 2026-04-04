# Video.js v10 Crunchyroll Player Integration

Replace the Crunchyroll iframe player's native UI with Video.js v10 React controls, using the web extension's `VideoHandle` as the media backend.

## Context

The current Crunchyroll player (`src/sources/crunchyroll/player.tsx`) loads crunchyroll.com in an iframe via `@fkn/lib`'s Frame abstraction. It injects CSS to maximize the video player and handles login detection. The native Crunchyroll controls remain visible.

The goal: hide Crunchyroll's native controls and overlay Video.js v10's React skin, controlling the iframe's `<video>` element through the web extension's stream-based `VideoHandle` API.

## Architecture

```
Embed page (embed.html)
├── Video.js React Skin (positioned overlay)
│   └── PlayButton, TimeSlider, VolumeSlider, FullscreenButton, etc.
├── Video.js Store + videoFeatures
│   └── reads/writes target.media (= RemoteMediaElement)
├── RemoteMediaElement (EventTarget + HTMLMediaElement-shaped API)
│   └── delegates to VideoHandle (sync reads, optimistic writes, event forwarding)
├── VideoHandle (from Frame.locator('video').video())
│   └── stream-synced local state, osra RPC to content script
└── Crunchyroll iframe
    └── native controls hidden via CSS, <video> controlled remotely
```

## Components

### 1. VideoHandle Media Adapter

**Inline in:** `src/sources/crunchyroll/player.tsx`

`VideoHandle` from `@fkn/lib` already satisfies most of Video.js v10's `HTMLMediaElement`-like expectations — sync property reads, optimistic setters, event dispatching, `play()`/`pause()`. A thin `Object.create` wrapper adds the few missing properties via prototype delegation:

```ts
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

Everything else (`paused`, `currentTime`, `volume`, `play()`, `pause()`, `addEventListener`, etc.) delegates directly to the VideoHandle through the prototype chain. No separate file needed.

### 2. CSS Injection — Hide Native Controls

**Modified in:** `src/sources/crunchyroll/player.tsx` (extend `CRUNCHYROLL_OUTER_CSS`)

Add a rule to hide Crunchyroll's native player controls:

```css
[data-testid="player-controls-root"] {
  display: none !important;
}
```

### 3. CrunchyrollPlayer Component Rewrite

**File:** `src/sources/crunchyroll/player.tsx`

The component goes through these states:

1. **Loading** — iframe created, Frame connecting, waiting for content script
2. **Login check** — Frame connected, checking if user is logged in
3. **Logged out** — show login overlay (same as current behavior)
4. **Connecting video** — logged in, locating `<video>` element, calling `locator.video()` to get VideoHandle
5. **Playing** — VideoHandle obtained, RemoteMediaElement created, Video.js store attached, skin rendered

```
iframe load → Frame connect → inject CSS → check login
                                              ├── logged out → show login button
                                              └── logged in → locate video → locator.video()
                                                              → create RemoteMediaElement
                                                              → render Video.js skin overlay
```

**Video.js integration:**

```tsx
import { createPlayer } from '@videojs/react'
import { videoFeatures } from '@videojs/react/presets/video'
import { VideoSkin } from '@videojs/react/presets/video'

const { Provider, usePlayer, useMedia } = createPlayer({ features: videoFeatures })

// Inside the component, once VideoHandle is obtained:
const media = asMediaElement(videoHandle)

// Render:
<Provider>
  <RemoteMediaProvider media={media}>
    <div css={overlayStyles}>
      <VideoSkin />
    </div>
  </RemoteMediaProvider>
</Provider>
```

`RemoteMediaProvider` is a small component that uses `useMediaAttach()` to register the `RemoteMediaElement` with the Video.js store as the media target.

**Overlay positioning:** The Video.js skin container is positioned `absolute` over the iframe, with `pointer-events: none` on the container and `pointer-events: auto` on the controls. This allows clicks on the video area to pass through to the iframe (or be intercepted for play/pause toggle).

### 4. Cleanup

The `VideoHandle` implements `Symbol.dispose`. When the component unmounts or the iframe navigates away, the handle is disposed, which cancels the stream reader and removes remote event listeners.

```tsx
useEffect(() => {
  // ... obtain videoHandle
  return () => { videoHandle[Symbol.dispose]() }
}, [deps])
```

## Dependencies

New npm packages to add:
- `@videojs/react` — React UI components and hooks
- `@videojs/core` — Core store, features, media abstractions (peer dep of @videojs/react)
- `@videojs/skins` — Default CSS skins
- `@videojs/icons` — Icon set used by default skin

These are all from the v10 monorepo at https://github.com/videojs/v10.

## File Changes Summary

| File | Change |
|------|--------|
| `package.json` | Add @videojs/react, @videojs/core, @videojs/skins, @videojs/icons |
| `src/sources/crunchyroll/player.tsx` | Rewrite — Video.js skin overlay, extended CSS injection, `asMediaElement` wrapper, video handle wiring |

## Risks and Unknowns

1. **Crunchyroll DOM selectors for hiding controls** — Using `[data-testid="player-controls-root"]` which is stable, but Crunchyroll could change test IDs in future updates.

2. **Video.js v10 is beta** — API may change. Pin exact versions.

3. **Preact compat with @videojs/react** — The aliases are set up in vite.config.ts. If Video.js uses React APIs that Preact doesn't support (e.g., `useSyncExternalStore` edge cases), we may need shims. Low risk given Preact 11's improved compat.

4. **TimeRanges shim** — Video.js features may do `instanceof TimeRanges` checks. If so, the plain-object shim in `asMediaElement` won't pass. Fallback: create a proper TimeRanges polyfill class. Low risk — v10's features likely use duck typing.

5. **Fullscreen** — `requestFullscreen()` on the VideoHandle calls it on the iframe's video element. For proper fullscreen, we may want to call `requestFullscreen()` on the embed page's container instead, so the Video.js skin stays visible in fullscreen. This needs the fullscreen feature's target to be the container, not the media — which is how v10 already works (`target.container`).

## Out of Scope

- Netflix player (future work, same pattern)
- Custom skin styling (using default Video.js skin for now)
- Subtitle/text track support (can be added later via Video.js text track features)
- Quality selection (depends on what Crunchyroll exposes)
