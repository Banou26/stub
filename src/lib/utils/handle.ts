import type { EpisodeHandle, TitleHandle } from '../types'

export const populateHandle = <T extends TitleHandle | EpisodeHandle>(handle: T): T => ({
  ...handle,
  uri: `${handle.scheme}:${handle.id}`,
  handles: handle.handles?.map(populateHandle),
  ...(<TitleHandle>handle).episodes && { episodes: (<TitleHandle>handle).episodes.map(populateHandle) }
})
