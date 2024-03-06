import { useMemo } from 'react'

export default ({ series }: { series: Series }) => {
  const isUnreleased = useMemo(() =>
    series
      ? series?.status === 'NOT_YET_RELEASED'
      : undefined
  , [series])

  const releasedNumbers = useMemo(() => {
    if (!series) return
    const nextRelease =
      series
        ?.airingSchedule
        ?.sort(({ date }, { date: date2 }) => date.getTime() - date2.getTime())
        .filter(({ date }) => Date.now() - date.getTime() < 0)
        .at(0)
    if (!nextRelease) return series.titleNumbers ?? 1
    return nextRelease.number
  }, [series])

  const nextAiring = useMemo(() =>
    series
      ?.airingSchedule
      ?.sort(({ date }, { date: date2 }) => date.getTime() - date2.getTime())
      .filter(({ date }) => Date.now() - date.getTime() < 0)
      .at(0),
    [series]
  )

  const startReleaseDateData = useMemo(
    () => series.dates?.at(0),
    [series]
  )

  const startReleaseDate = useMemo(() => {
      if (!startReleaseDateData) return
      const date = startReleaseDateData
      return {
        number: 0,
        date:
          'start' in date ? date.start
          : date?.date
      }
    },
    [startReleaseDateData]
  )

  const startReleaseDelta = useMemo(() => {
    if (!startReleaseDate?.date) return
    return startReleaseDate?.date.getTime() - Date.now()
  }, [series])

  const nextAiringDelta = useMemo(() => {
    if (!nextAiring?.date) return
    return nextAiring?.date.getTime() - Date.now()
  }, [series])

  const delta = useMemo(() =>
    nextAiringDelta ?? startReleaseDelta,
    [nextAiringDelta, startReleaseDelta]
  )

  if (series.names.some(({ name }) => name === 'Made in Abyss: Retsujitsu no Ougonkyou')) {
    console.log('series?.airingSchedule', series?.airingSchedule)
  }

  const days = useMemo(() => delta ? Math.floor(delta / (1000 * 60 * 60 * 24)) : undefined, [delta])
  const hours = useMemo(() => delta ? Math.floor((delta % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : undefined, [delta])

  const releaseDate = useMemo(() =>
    series && startReleaseDateData && 'date' in startReleaseDateData &&
    (series.categories.some(category => category === 'MOVIE')
      ? `${startReleaseDateData.date.getFullYear()}`
      : `${startReleaseDateData.date.toDateString().slice(4).trim()}`),
    [series, startReleaseDateData]
  )

  const dateStart = useMemo(() =>
    startReleaseDateData &&
    !('date' in startReleaseDateData) &&
    startReleaseDateData.start.toDateString().slice(4).trim(),
    [startReleaseDateData]
  )

  const dateEnd = useMemo(() =>
    startReleaseDateData &&
    !('date' in startReleaseDateData) &&
    startReleaseDateData.end?.toDateString().slice(4).trim(),
    [startReleaseDateData]
  )

  const airingDate =
    series && startReleaseDateData && !('date' in startReleaseDateData) &&
    startReleaseDateData.end
      ? `${dateStart} to ${dateEnd}`
      : startReleaseDateData?.start?.toDateString() ?? ''

  const release =
    series && startReleaseDateData
      ? (
        'date' in startReleaseDateData
          ? releaseDate
          : airingDate
      )
      : ''

  const past =
    !startReleaseDateData ? undefined
    : series ?.airingSchedule && delta ? delta < 0
    : 'date' in startReleaseDateData ? startReleaseDateData.date.getTime() < Date.now()
    : startReleaseDateData.start.getTime() < Date.now()

  return (
    <div className="episode">
      <div className="number">
        {
          series.airingSchedule
            ? (
              <>
                Ep {releasedNumbers ? releasedNumbers : '...'} {series.titleNumbers ? `of ${series.titleNumbers} ` : ''}
                {
                  past
                    ? 'aired on'
                    : 'airing in'
                }
              </>
            )
            : (
              <>Start{past ? 'ed' : 's'} airing</>
            )
        }
      </div>
      <div className="date">
        {
          series.airingSchedule && delta && !past ? (
            <>
            {
              days
                ? <>{days} day, </>
                : null
            }
            {hours} hours
            </>
          )
          : release ? release
          : null
        }
      </div>
    </div>
  )
}
