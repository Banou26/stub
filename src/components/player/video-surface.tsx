import type { ComponentChildren, FunctionComponent } from 'preact'
import type { PlayerCapabilities, PlayerSelection } from './types'

import { useState } from 'preact/hooks'
import {
  AlertDialog,
  BufferingIndicator,
  Container,
  Controls,
  ErrorDialog,
  FullscreenButton,
  MediaGesture,
  MediaHotkey,
  MuteButton,
  PiPButton,
  PlayButton,
  PlaybackRateButton,
  Popover,
  SeekButton,
  Slider,
  Time,
  TimeSlider,
  Tooltip,
  VolumeSlider,
} from '@videojs/react'
import {
  AudioLines,
  Captions,
  CaptionsOff,
  Check,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'

const SEEK_TIME = 10

// Recomposes the videojs default video skin from its exported parts so the
// optional capability menus (subtitles, audio tracks, quality) can sit in the
// controls row as first-class popovers. The stock `VideoSkin` preset renders
// the same controls hardcoded with no slot for additions, and its captions
// button only understands DOM textTracks, which a remote media handle does
// not expose - so the surface is rebuilt here with the source-driven menus in
// its place. The container keeps the stock `media-default-skin` classes so
// the published skin.css applies unchanged, and children stay the first
// child (the media surface: the source iframe).
//
// The library's components are typed against React and return
// `ComponentChild`; under stub's preact/compat aliasing that is not a valid
// JSX return, so every library component is narrowed to a preact
// FunctionComponent (same runtime, same trick the per-source players used for
// `VideoSkin`).

const asFC = <P,>(component: unknown): FunctionComponent<P> => component as FunctionComponent<P>

const ControlsRoot = asFC<{ className?: string, children?: ComponentChildren }>(Controls.Root)
const BufferingIndicatorC = asFC<{ render?: unknown }>(BufferingIndicator)
const ErrorDialogRoot = asFC<{ children?: ComponentChildren }>(ErrorDialog.Root)
const AlertDialogPopup = asFC<{ className?: string, children?: ComponentChildren }>(AlertDialog.Popup)
const AlertDialogTitle = asFC<{ className?: string, children?: ComponentChildren }>(AlertDialog.Title)
const AlertDialogClose = asFC<{ className?: string, children?: ComponentChildren }>(AlertDialog.Close)
const ErrorDialogDescription = asFC<{ className?: string }>(ErrorDialog.Description)
const TooltipProvider = asFC<{ children?: ComponentChildren }>(Tooltip.Provider)
const TooltipRoot = asFC<{ side?: string, children?: ComponentChildren }>(Tooltip.Root)
const TooltipTrigger = asFC<{ render?: ComponentChildren }>(Tooltip.Trigger)
const TooltipPopup = asFC<{ className?: string, children?: ComponentChildren }>(Tooltip.Popup)
const PopoverRoot = asFC<{
  open?: boolean
  onOpenChange?: (open: boolean) => void
  openOnHover?: boolean
  delay?: number
  closeDelay?: number
  side?: string
  children?: ComponentChildren
}>(Popover.Root)
const PopoverTrigger = asFC<{ render?: ComponentChildren, children?: ComponentChildren }>(Popover.Trigger)
const PopoverPopup = asFC<{ className?: string, children?: ComponentChildren }>(Popover.Popup)
const PlayButtonC = asFC<{ className?: string, render?: ComponentChildren, children?: ComponentChildren }>(PlayButton)
const SeekButtonC = asFC<{ seconds?: number, className?: string, render?: ComponentChildren, children?: ComponentChildren }>(SeekButton)
const MuteButtonC = asFC<{ className?: string, render?: ComponentChildren, children?: ComponentChildren }>(MuteButton)
const PiPButtonC = asFC<{ className?: string, render?: ComponentChildren, children?: ComponentChildren }>(PiPButton)
const FullscreenButtonC = asFC<{ className?: string, render?: ComponentChildren, children?: ComponentChildren }>(FullscreenButton)
const PlaybackRateButtonC = asFC<{ className?: string, render?: ComponentChildren }>(PlaybackRateButton)
const TimeValue = asFC<{ type?: string, className?: string }>(Time.Value)
const TimeSliderRoot = asFC<{ className?: string, children?: ComponentChildren }>(TimeSlider.Root)
const SliderTrack = asFC<{ className?: string, children?: ComponentChildren }>(Slider.Track)
const SliderFill = asFC<{ className?: string }>(Slider.Fill)
const SliderBuffer = asFC<{ className?: string }>(Slider.Buffer)
const SliderThumb = asFC<{ className?: string }>(Slider.Thumb)
const SliderValue = asFC<{ type?: string, className?: string }>(Slider.Value)
const VolumeSliderRoot = asFC<{ className?: string, orientation?: string, thumbAlignment?: string, children?: ComponentChildren }>(VolumeSlider.Root)
const MediaHotkeyC = asFC<{ keys: string, action: string, value?: number }>(MediaHotkey)
const MediaGestureC = asFC<{ type: string, action: string, value?: number, pointer?: string, region?: string }>(MediaGesture)
const ContainerC = asFC<{ className?: string, children?: ComponentChildren } & Record<string, unknown>>(Container)

type IntrinsicButton = {
  type?: 'button' | 'submit' | 'reset'
  className?: string
  'aria-label'?: string
  children?: ComponentChildren
}

const IconButton = (props: IntrinsicButton) => (
  <button type="button" className="media-button media-button--subtle media-button--icon" {...props} />
)

// Shared popover shell for the capability menus: a subtle icon trigger and a
// surface popup listing the choices, mirroring the skin's volume popover.
const SelectionMenu = ({ selection, icon }: { selection: PlayerSelection, icon: ComponentChildren }) => {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const choices = [
    ...(selection.offLabel ? [{ id: null as string | null, label: selection.offLabel }] : []),
    ...selection.options,
  ]

  const select = (id: string | null) => {
    if (id === selection.selectedId) {
      setOpen(false)
      return
    }
    setFailed(false)
    setPending(true)
    Promise.resolve()
      .then(() => selection.onSelect(id))
      .then(() => setOpen(false))
      .catch(err => {
        console.warn(`[player] ${selection.label} selection failed:`, err)
        setFailed(true)
      })
      .finally(() => setPending(false))
  }

  return (
    <PopoverRoot open={open} onOpenChange={next => setOpen(next)}>
      <PopoverTrigger
        render={
          <IconButton
            className={`media-button--menu${failed ? ' media-button--error' : ''}`}
            aria-label={selection.label}
          />
        }
      >
        {icon}
      </PopoverTrigger>
      <PopoverPopup className="media-surface media-popover media-popover--menu">
        <div className="media-menu" role="menu" aria-label={selection.label}>
          <div className="media-menu__heading">{selection.label}</div>
          {choices.map(choice => {
            const selected = choice.id === selection.selectedId
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                key={choice.id ?? '__off__'}
                className={`media-menu__item${selected ? ' media-menu__item--active' : ''}`}
                disabled={pending || ('disabled' in choice && choice.disabled)}
                onClick={() => select(choice.id)}
              >
                <span className="media-menu__check">{selected ? <Check size={14} /> : null}</span>
                <span className="media-menu__label">{choice.label}</span>
                {'description' in choice && choice.description
                  ? <span className="media-menu__description">{choice.description}</span>
                  : null}
              </button>
            )
          })}
        </div>
      </PopoverPopup>
    </PopoverRoot>
  )
}

const VolumePopover = () => (
  <PopoverRoot openOnHover delay={200} closeDelay={100} side="top">
    <PopoverTrigger
      render={
        <MuteButtonC
          className="media-button--mute"
          render={<IconButton />}
        >
          <VolumeX className="media-icon media-icon--volume-off" />
          <Volume1 className="media-icon media-icon--volume-low" />
          <Volume2 className="media-icon media-icon--volume-high" />
        </MuteButtonC>
      }
    />
    <PopoverPopup className="media-surface media-popover media-popover--volume">
      <VolumeSliderRoot className="media-slider" orientation="vertical" thumbAlignment="edge">
        <SliderTrack className="media-slider__track">
          <SliderFill className="media-slider__fill" />
        </SliderTrack>
        <SliderThumb className="media-slider__thumb media-slider__thumb--persistent" />
      </VolumeSliderRoot>
    </PopoverPopup>
  </PopoverRoot>
)

export type VideoSurfaceProps = {
  capabilities?: PlayerCapabilities
  children?: ComponentChildren
} & Record<string, unknown>

const VideoSurface = ({ capabilities, children, ...rest }: VideoSurfaceProps) => (
  <ContainerC className="media-default-skin media-default-skin--video" {...rest}>
    {children}
    <BufferingIndicatorC
      render={(props: Record<string, unknown>) => (
        <div {...props} className="media-buffering-indicator">
          <div className="media-surface">
            <LoaderCircle className="media-icon" />
          </div>
        </div>
      )}
    />
    <ErrorDialogRoot>
      <AlertDialogPopup className="media-error">
        <div className="media-error__dialog media-surface">
          <div className="media-error__content">
            <AlertDialogTitle className="media-error__title">Something went wrong.</AlertDialogTitle>
            <ErrorDialogDescription className="media-error__description" />
          </div>
          <div className="media-error__actions">
            <AlertDialogClose className="media-button media-button--primary">OK</AlertDialogClose>
          </div>
        </div>
      </AlertDialogPopup>
    </ErrorDialogRoot>
    <ControlsRoot className="media-surface media-controls">
      <TooltipProvider>
        <div className="media-button-group">
          <TooltipRoot side="top">
            <TooltipTrigger
              render={
                <PlayButtonC className="media-button--play" render={<IconButton />}>
                  <RotateCcw className="media-icon media-icon--restart" />
                  <Play className="media-icon media-icon--play" />
                  <Pause className="media-icon media-icon--pause" />
                </PlayButtonC>
              }
            />
            <TooltipPopup className="media-surface media-tooltip" />
          </TooltipRoot>
          <TooltipRoot side="top">
            <TooltipTrigger
              render={
                <SeekButtonC seconds={-SEEK_TIME} className="media-button--seek" render={<IconButton />}>
                  <span className="media-icon__container">
                    <RotateCcw className="media-icon media-icon--seek media-icon--flipped" />
                    <span className="media-icon__label">{SEEK_TIME}</span>
                  </span>
                </SeekButtonC>
              }
            />
            <TooltipPopup className="media-surface media-tooltip">Seek backward {SEEK_TIME} seconds</TooltipPopup>
          </TooltipRoot>
          <TooltipRoot side="top">
            <TooltipTrigger
              render={
                <SeekButtonC seconds={SEEK_TIME} className="media-button--seek" render={<IconButton />}>
                  <span className="media-icon__container">
                    <RotateCw className="media-icon media-icon--seek" />
                    <span className="media-icon__label">{SEEK_TIME}</span>
                  </span>
                </SeekButtonC>
              }
            />
            <TooltipPopup className="media-surface media-tooltip">Seek forward {SEEK_TIME} seconds</TooltipPopup>
          </TooltipRoot>
        </div>
        <div className="media-time-controls">
          <TimeValue type="current" className="media-time" />
          <TimeSliderRoot className="media-slider">
            <SliderTrack className="media-slider__track">
              <SliderFill className="media-slider__fill" />
              <SliderBuffer className="media-slider__buffer" />
            </SliderTrack>
            <SliderThumb className="media-slider__thumb" />
            <div className="media-surface media-preview media-slider__preview">
              <SliderValue type="pointer" className="media-time media-preview__time" />
            </div>
          </TimeSliderRoot>
          <TimeValue type="duration" className="media-time" />
        </div>
        <div className="media-button-group">
          <TooltipRoot side="top">
            <TooltipTrigger
              render={
                <PlaybackRateButtonC className="media-button--playback-rate" render={<IconButton />} />
              }
            />
            <TooltipPopup className="media-surface media-tooltip">Toggle playback rate</TooltipPopup>
          </TooltipRoot>
          <VolumePopover />
          {capabilities?.subtitles && (
            <SelectionMenu
              selection={capabilities.subtitles}
              icon={capabilities.subtitles.selectedId
                ? <Captions className="media-icon" />
                : <CaptionsOff className="media-icon" />}
            />
          )}
          {capabilities?.audioTracks && (
            <SelectionMenu selection={capabilities.audioTracks} icon={<AudioLines className="media-icon" />} />
          )}
          {capabilities?.qualityLevels && (
            <SelectionMenu selection={capabilities.qualityLevels} icon={<Settings2 className="media-icon" />} />
          )}
          <TooltipRoot side="top">
            <TooltipTrigger
              render={
                <PiPButtonC className="media-button--pip" render={<IconButton />}>
                  <PictureInPicture2 className="media-icon media-icon--pip-enter" />
                  <PictureInPicture2 className="media-icon media-icon--pip-exit" />
                </PiPButtonC>
              }
            />
            <TooltipPopup className="media-surface media-tooltip" />
          </TooltipRoot>
          <TooltipRoot side="top">
            <TooltipTrigger
              render={
                <FullscreenButtonC className="media-button--fullscreen" render={<IconButton />}>
                  <Maximize className="media-icon media-icon--fullscreen-enter" />
                  <Minimize className="media-icon media-icon--fullscreen-exit" />
                </FullscreenButtonC>
              }
            />
            <TooltipPopup className="media-surface media-tooltip" />
          </TooltipRoot>
        </div>
      </TooltipProvider>
    </ControlsRoot>
    <div className="media-overlay" />
    <MediaHotkeyC keys="Space" action="togglePaused" />
    <MediaHotkeyC keys="k" action="togglePaused" />
    <MediaHotkeyC keys="m" action="toggleMuted" />
    <MediaHotkeyC keys="f" action="toggleFullscreen" />
    <MediaHotkeyC keys="i" action="togglePictureInPicture" />
    <MediaHotkeyC keys="ArrowRight" action="seekStep" value={5} />
    <MediaHotkeyC keys="ArrowLeft" action="seekStep" value={-5} />
    <MediaHotkeyC keys="l" action="seekStep" value={10} />
    <MediaHotkeyC keys="j" action="seekStep" value={-10} />
    <MediaHotkeyC keys="ArrowUp" action="volumeStep" value={0.05} />
    <MediaHotkeyC keys="ArrowDown" action="volumeStep" value={-0.05} />
    <MediaHotkeyC keys="0-9" action="seekToPercent" />
    <MediaHotkeyC keys="Home" action="seekToPercent" value={0} />
    <MediaHotkeyC keys="End" action="seekToPercent" value={100} />
    <MediaHotkeyC keys=">" action="speedUp" />
    <MediaHotkeyC keys="<" action="speedDown" />
    <MediaGestureC type="tap" action="togglePaused" pointer="mouse" region="center" />
    <MediaGestureC type="tap" action="toggleControls" pointer="touch" />
    <MediaGestureC type="doubletap" action="seekStep" value={-10} region="left" />
    <MediaGestureC type="doubletap" action="toggleFullscreen" region="center" />
    <MediaGestureC type="doubletap" action="seekStep" value={10} region="right" />
  </ContainerC>
)

export default VideoSurface as FunctionComponent<VideoSurfaceProps>
