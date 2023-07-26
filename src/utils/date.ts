import type { DateData, Series, Title, AiringSchedule } from '../../../../scannarr/src'

const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const
export const getSeason = (d: Date) => seasons[Math.floor((d.getMonth() / 12) * 4) % 4]

export const getNextAiring = (airingSchedules: AiringSchedule[]) =>
  airingSchedules
    ?.sort(({ date }, { date: date2 }) => date.getTime() - date2.getTime())
    .filter(({ date }) => Date.now() - date.getTime() < 0)
    .at(0)

export const getNextRelease = (date?: DateData, airingSchedules?: AiringSchedule[]) =>
  airingSchedules ? getNextAiring(airingSchedules)
  : (
    date && 'start' in date && Date.now() - date.start.getTime() < 0 ? { date: date.start }
    : date && 'date' in date && Date.now() - date.date.getTime() ? { date: date?.date }
    : undefined
  )

export const makeRelativeDate = (date: Date) => {
  const time = date.getTime() - Date.now()
  const days = Math.floor(time / (1000 * 60 * 60 * 24))
  const hours = Math.floor((time % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return {
    time,
    days,
    hours
  }
}

export const normalizeHandleDates = (handle?: Series | Title) => {
  const nextRelease = getNextRelease(
    handle?.dates?.at(0),
    handle && 'airingSchedule' in handle
      ? handle.airingSchedule
      : undefined
  )



  const dateData = handle?.dates?.at(0)

  const releaseDate =
    handle && dateData && 'date' in dateData &&
    (handle.categories.some(category => category === 'MOVIE')
      ? `${dateData.date.getFullYear()}`
      : `${dateData.date.toDateString().slice(4).trim()}`)

  const dateStart =
    dateData &&
    !('date' in dateData) &&
    dateData.start.toDateString().slice(4).trim()
  const dateEnd =
    dateData &&
    !('date' in dateData) &&
    dateData.end?.toDateString().slice(4).trim()

  // todo: fix date display,  dateData?.start?.toDateString() ?? '' sometimes returns Invalid Date, e.g: http://616331fa7b57db93f0957a18.localhost:2345/title/anilist:144858
  const airingDate =
    handle && dateData && !('date' in dateData) &&
    dateData.end
      ? `${dateStart} to ${dateEnd}`
      : dateData?.start?.toDateString() ?? ''

  const release =
    handle && dateData
      ? (
        'date' in dateData
          ? releaseDate
          : airingDate
      )
      : ''

  const past =
    !dateData ? undefined
    : handle ?.airingSchedule && delta ? delta < Date.now()
    : 'date' in dateData ? dateData.date.getTime() < Date.now()
    : dateData.start.getTime() < Date.now()

  return {

    relative:
      nextRelease?.date
      ? makeRelativeDate(nextRelease?.date)
      : undefined
  }
}
