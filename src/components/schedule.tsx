import type { Series } from '../../../../scannarr/src'

import { useEffect, useMemo, useState } from 'react'

export default ({ series }: { series: Series }) => {
  const [delta, setDelta] = useState<number>()

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

  useEffect(() => {
    if (!series.dates) return
    const date = series.dates.at(0)
    const nextRelease =
      series
        ?.airingSchedule
        ?.sort(({ date }, { date: date2 }) => date.getTime() - date2.getTime())
        .filter(({ date }) => Date.now() - date.getTime() < 0)
        .at(0)
      ?? ({
        number: 0,
        date: date &&
          'start' in date ? date.start
          : date?.date
      })
    if (!nextRelease?.date) return
    setDelta(nextRelease?.date.getTime() - Date.now())
  }, [series])

  const days = useMemo(() => delta ? Math.floor(delta / (1000 * 60 * 60 * 24)) : undefined, [delta])
  const hours = useMemo(() => delta ? Math.floor((delta % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : undefined, [delta])

  const dateData = series?.dates?.at(0)

  const releaseDate =
    series && dateData && 'date' in dateData &&
    (series.categories.some(category => category === 'MOVIE')
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
    series && dateData && !('date' in dateData) &&
    dateData.end
      ? `${dateStart} to ${dateEnd}`
      : dateData?.start?.toDateString() ?? ''

  const release =
    series && dateData
      ? (
        'date' in dateData
          ? releaseDate
          : airingDate
      )
      : ''

  const past =
    !dateData ? undefined
    : series ?.airingSchedule && delta ? delta < Date.now()
    : 'date' in dateData ? dateData.date.getTime() < Date.now()
    : dateData.start.getTime() < Date.now()

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
          series.airingSchedule && delta && !past ? <>{days} day, {hours} hours</>
          : release ? release
          : null
        }
      </div>
    </div>
  )
}
