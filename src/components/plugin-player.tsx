import { css } from '@emotion/react'
import { packages } from '@fkn/lib'
import { useEffect, useRef, useState } from 'preact/hooks'

import { STUB_SOURCE_PROTOCOL } from '../plugin-api'
import { fromUri } from '../utils/uri'

const style = css`
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #000;

  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: none;
  }

  .failed {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    background: #000;
    color: rgba(255, 255, 255, 0.55);
    font-size: 1.4rem;
  }
`

type PlayableSource = {
  origin?: string
  play?: (release: { uri: string, url?: string }) => Promise<boolean>
}

type PluginPayload = PlayableSource & { sources?: PlayableSource[] }

export type PluginPlayerProps = {
  pluginUri: string
  /** the handle stub already holds for this release; the source reads whatever it put there */
  release: { uri: string, url?: string }
  onUnplayable: () => void
}

/**
 * Plays a release inside the source package's own frame.
 *
 * `mount` rather than `show`: the frame is ours, so it lays out in the player box, scrolls with the page
 * and fullscreens natively. `show` would paint it in FKN's overlay at the top of the stacking order,
 * which is fine for a modal picker and wrong for a player sitting in a page that has its own chrome
 * over it.
 *
 * The connection is this component's own, separate from the worker's: they are two documents of one
 * package, so calling `play` on the worker's connection would render into a frame nobody can see.
 */
export const PluginPlayer = ({ pluginUri, release, onUnplayable }: PluginPlayerProps) => {
  const slot = useRef<HTMLIFrameElement>(null)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    const iframe = slot.current
    if (!iframe) return
    let done = false
    let mounted: { unmount: () => void } | undefined
    setFailed('')

    const run = async () => {
      try {
        // the SAME contract tag the worker connects under. Both are stub asking for `stub-source@1`, and
        // this is the hop that renders the package into stub's own document, so it is the last one that
        // should arrive unnamed: a package reading `protocol` to decide what it serves would otherwise
        // see null here and have to guess.
        const connection = await packages.mount<PluginPayload>(pluginUri, {
          iframe,
          protocol: STUB_SOURCE_PROTOCOL,
        })
        if (done) { connection.unmount(); return }
        mounted = connection
        // one package may ship a family of sources, so the one that owns this release is picked by the
        // origin its uri carries. The single-source shape is the same payload without the list, which
        // is what every plugin written before source families sends.
        const { origin } = fromUri(release.uri as `${string}:${string}`)
        const payload = connection.remote
        const source = payload.sources?.find(entry => entry.origin === origin) ?? payload
        const played = await source.play?.({ uri: release.uri, url: release.url })
        if (done) return
        // false is the source saying it cannot play THIS release, which is a fallback, not a failure
        if (!played) { connection.unmount(); mounted = undefined; onUnplayable() }
      } catch (error) {
        if (done) return
        setFailed(error instanceof Error ? error.message : String(error))
      }
    }
    run()

    return () => {
      done = true
      mounted?.unmount()
    }
  }, [pluginUri, release.uri, release.url])

  return (
    <div css={style}>
      {/*
        Rendered unconditionally, and the failure message covers it rather than replacing it. The effect
        needs this ref to exist to mount at all, so swapping the frame out on failure would mean a source
        that failed once could never be retried, not even for a different release.

        The capabilities are granted HERE because permissions policy is read at navigation and is not
        inherited. The plugin passes the same set down to whatever it nests inside itself (ripple, for a
        torrent release), and it can only pass on what this frame was granted.
      */}
      <iframe
        ref={slot}
        sandbox="allow-scripts allow-same-origin"
        allow="fullscreen; autoplay; encrypted-media; cross-origin-isolated"
      />
      {failed ? <div className="failed">This source could not start playback. {failed}</div> : null}
    </div>
  )
}

export default PluginPlayer
