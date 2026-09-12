/**
 * `plugin:range` of 5.4 P4: the episode pairs that place a play button, and the ranges of 3.4.
 *
 * WHAT EACH CASE IS FOR. The plugin has exactly two ways to be wrong and both are expensive, so the
 * cases are built around them. It can mint a pair that is NOT the same broadcast, which puts a
 * playable url on the wrong row (the title-vote offset put 13 of 25 Blue Exorcist rows wrong,
 * 2026-09-10); or it can refuse a pair it could have proven, which costs a run its buttons silently.
 * So every walkthrough of section 8 is here with its own numbers, each refusal is a case of its own,
 * and the rule that mints nothing at all (Netflix) is asserted as hard as the ones that mint.
 *
 * Every case names the mutation that reddens it. A rule whose whole output is "nothing was proven" is
 * the kind that passes while doing nothing, and three of the cases below assert exactly that.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import { existsSync, readFileSync } from 'node:fs'

import type { AnswerRow } from '../../../../../src/worker/graph/answers'
import type { SideEpisode } from '../../../../../src/worker/graph/plugins/range'

import { enableGraph } from '../../../../../src/worker/graph'
import { closeGraph } from '../../../../../src/worker/graph/engine'
import { ingestAnswers, replayAnswers } from '../../../../../src/worker/graph/ingest'
import { graphReady } from '../../../../../src/worker/graph/schema'
import { resetPassState, runPlugins } from '../../../../../src/worker/graph/plugins/runner'
import { profilePlugin } from '../../../../../src/worker/graph/plugins/profile'
import { directPlugin } from '../../../../../src/worker/graph/plugins/direct'
import { aggregatePlugin } from '../../../../../src/worker/graph/plugins/aggregate'
import { containmentPlugin } from '../../../../../src/worker/graph/plugins/containment'
import {
  decideCandidate, hullOf, MIN_ALIGNED, numbersOutsideRun, pairsByDay, pairsByTitle, placesClaim, rangePlugin,
  scheduleSkew,
} from '../../../../../src/worker/graph/plugins/range'
import { checkInvariants } from '../../../../../src/worker/graph/plugins/invariants'
import { alignmentOffset } from '../../../../../src/worker/store/consensus'
import type { Episode } from '../../../../../src/worker/store/types'
import { answer, episode, media, rowsOf, title } from './fixtures'

const CORPUS = new URL('../../../../../corpus/season/summer-2026/answers.jsonl', import.meta.url).pathname

const MS_PER_DAY = 86_400_000
const dayOf = (date: string): number => Math.floor(Date.parse(date) / MS_PER_DAY)

/** `count` weekly days from `from`, as `YYYY-MM-DD`: the shape a named day arrives in (5.4 P0). */
const weekly = (from: string, count: number, skip = 0): string[] =>
  Array.from({ length: count }, (_, index) =>
    new Date(Date.parse(from) + (skip + index) * 7 * MS_PER_DAY).toISOString().slice(0, 10))

/** ani.zip's own stamp: `2021-01-10T15:00:00Z` is the 11th in Tokyo and the 10th in UTC (`consensus.ts:136-140`). */
const anizipDay = (day: string): string => `${day}T15:00:00.000Z`

const sameAs = (node: Record<string, unknown>) => ({ relation: 'SAME_AS', node })
/** A `PART_OF` handle onto a season row, which does NOT stamp a scope: the target's answer decides. */
const partOf = (node: Record<string, unknown>) => ({ relation: 'PART_OF', node })

const PLUGINS = [profilePlugin, directPlugin, aggregatePlugin, containmentPlugin, rangePlugin]

const runPass = async (plugins = PLUGINS) => {
  const report = await runPlugins(plugins, { reason: 'manual' })
  expect(report.audit.ok, report.audit.differences.join('; ')).toBe(true)
  expect(report.runs.filter(run => run.failed).map(run => `${run.id}: ${run.failed}`)).toEqual([])
  // A PASS THAT HIT THE CAP HAS NOT REACHED A FIXED POINT (5.3). This plugin feeds `plugin:aggregate`
  // (a pair renumbers a row, which moves a slot) and is fed by it (the run length), so a rule that
  // depended on its own output would oscillate rather than throw
  expect(report.anomalies.map(anomaly => anomaly.rule).filter(rule => rule === 'fixed-point-cap')).toEqual([])
  return report
}

/** Every `EPISODE_LINK` this plugin wrote out of one media's episodes, in the pairing order. */
const pairsFrom = async (mediaUri: string) => rowsOf(
  `MATCH (m:Media {uri: $uri})-[:HAS_EPISODE]->(a:Episode)-[l:EPISODE_LINK]->(b:Episode)
   WHERE l.by = 'plugin:range'
   RETURN a.uri AS fromUri, b.uri AS toUri, l.fromNumber AS fromNumber, l.toNumber AS toNumber,
     l.kind AS kind, l.status AS status, l.reason AS reason, l.confidence AS confidence,
     l.evidence AS evidence, l.supports AS supports
   ORDER BY l.fromNumber, b.uri`,
  { uri: mediaUri }
)

/** Every `LINK` this plugin wrote, active and refused alike. */
const rangeLinks = async () => rowsOf(
  `MATCH (a:Media)-[l:LINK]->(b:Media)
   WHERE l.by = 'plugin:range'
   RETURN a.uri AS fromUri, b.uri AS toUri, l.kind AS kind, l.status AS status, l.reason AS reason,
     l.fromStart AS fromStart, l.fromEnd AS fromEnd, l.toStart AS toStart, l.toEnd AS toEnd,
     l.contiguous AS contiguous, l.aligned AS aligned, l.total AS total, l.evidence AS evidence,
     l.supports AS supports
   ORDER BY fromUri, toUri`
)

const linksBetween = async (fromUri: string, toUri: string) => rowsOf(
  `MATCH (a:Media {uri: $fromUri})-[l:LINK]-(b:Media {uri: $toUri})
   RETURN l.kind AS kind, l.status AS status, l.reason AS reason, l.by AS by
   ORDER BY by, kind, reason`,
  { fromUri, toUri }
)

/** Every slot the episodes of one uri space fill, which is what a pair is FOR (5.4 P5, 8.1). */
const fillsFrom = async (prefix: string) => {
  const rows = await rowsOf(
    `MATCH (e:Episode)-[f:FILLS]->(s:Slot)
     WHERE e.uri STARTS WITH $prefix
     RETURN e.uri AS uri, s.id AS slot, s.number AS slotNumber, f.number AS number, f.via AS via,
       f.supports AS supports
     ORDER BY uri, slot`,
    { prefix }
  )
  return rows.map(row => ({
    uri: String(row.uri),
    slot: String(row.slot),
    slotNumber: row.slotNumber === null ? null : Number(row.slotNumber),
    number: row.number === null ? null : Number(row.number),
    via: String(row.via),
    supports: row.supports as string[],
  }))
}

/** The cluster one uri sits in, which is what a slot id is prefixed with. */
const clusterIdOf = async (uri: string): Promise<string> => {
  const [row] = await rowsOf('MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster) RETURN c.id AS id', { uri })
  return String(row!.id)
}

/** Every episode pair between two uri spaces, refused ones included: the row a refusal lives on. */
const pairsBetween = async (fromPrefix: string, toPrefix: string) => rowsOf(
  `MATCH (a:Episode)-[l:EPISODE_LINK]->(b:Episode)
   WHERE a.uri STARTS WITH $fromPrefix AND b.uri STARTS WITH $toPrefix
   RETURN a.uri AS fromUri, b.uri AS toUri, l.status AS status, l.reason AS reason, l.by AS by,
     l.key AS key, l.fromNumber AS fromNumber, l.toNumber AS toNumber, l.confidence AS confidence,
     l.supports AS supports
   ORDER BY fromUri, toUri`,
  { fromPrefix, toPrefix }
)

const evidenceOf = (row: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(String(row.evidence ?? '{}')) as Record<string, unknown>

// ---------------------------------------------------------------------------------------------
// The fixtures. Every uri and every number is the record's where the record has one, and says so
// where it does not (8.1 to 8.4, `consensus.test.ts:284-288`).

// 8.1: eleven weekly slots from the real premiere, ani.zip stamping the UTC day and Crunchyroll the
// Tokyo one, which is the day of slack the rule exists for
const MUSHOKU_C1 = weekly('2021-01-10', 11)
const MUSHOKU_C1_TOKYO = weekly('2021-01-11', 11)
const MUSHOKU_C2 = weekly('2021-10-03', 12)
const MUSHOKU_C2_TOKYO = weekly('2021-10-04', 12)

// 8.2: twelve weekly slots, Crunchyroll numbering 13 to 20 on the first eight of the SAME days
const SAMURAI = weekly('2026-07-17', 12)

// 8.3: 25 episodes our side, 26 rows on Netflix's with a special inserted at position 14
const EXORCIST = weekly('2011-04-17', 25)

// 8.4: 64 episodes in five seasons of 13, 13, 13, 13 and 12
const FMA = weekly('2009-04-05', 64)

const mushokuAnswers = async () => [
  await answer('media', media('anilist:108465', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 11, startDate: MUSHOKU_C1[0],
    titles: [title('en', 'Mushoku Tensei Jobless Reincarnation')],
    handles: [
      sameAs(media('mal:39535', { score: 0.9 })),
      sameAs(media('anizip:14758', {})),
      partOf(media('cr:G24H1N3MP-G609CX3J4', { score: 0.5 })),
    ],
  })),
  await answer('media', media('mal:39535', {
    score: 0.9, type: 'TV', status: 'FINISHED', episodeCount: 11, startDate: MUSHOKU_C1[0],
    titles: [title('en', 'Mushoku Tensei Jobless Reincarnation')],
  })),
  await answer('media', media('anizip:14758', {
    type: 'TV', episodeCount: 11, titles: [title('en', 'Mushoku Tensei Jobless Reincarnation')],
    episodes: MUSHOKU_C1.map((day, index) => episode(`anizip:14758-${index + 1}`, 'anizip:14758', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Cour One ${index + 1}`)],
    })),
  })),
  // cour 2. Its own anidb id is not in the record (8.1), so the fixture names one
  await answer('media', media('anilist:127720', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 12, startDate: MUSHOKU_C2[0],
    titles: [title('en', 'Mushoku Tensei Jobless Reincarnation Part 2')],
    handles: [sameAs(media('anizip:14759', {})), partOf(media('cr:G24H1N3MP-G609CX3J4', { score: 0.5 }))],
  })),
  await answer('media', media('anizip:14759', {
    type: 'TV', episodeCount: 12, titles: [title('en', 'Mushoku Tensei Jobless Reincarnation Part 2')],
    episodes: MUSHOKU_C2.map((day, index) => episode(`anizip:14759-${index + 1}`, 'anizip:14759', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Cour Two ${index + 1}`)],
    })),
  })),
  // Crunchyroll's season 1: 23 episodes plus a special, listLength 24, dated per episode and with no
  // season start date of its own (8.1). Its titles are its own, so only the dates can prove the fold
  await answer('media', media('cr:G24H1N3MP-G609CX3J4', {
    score: 0.5, type: 'TV', status: 'FINISHED', episodeCount: 24,
    titles: [title('en', 'Mushoku Tensei Jobless Reincarnation Season 1')],
    episodes: [
      ...MUSHOKU_C1_TOKYO.map((day, index) => episode(`cr:G609CX3J4-${index + 1}`, 'cr:G24H1N3MP-G609CX3J4', {
        episodeNumber: index + 1, releaseDate: day, titles: [title('en', `Crunchyroll ${index + 1}`)],
      })),
      ...MUSHOKU_C2_TOKYO.map((day, index) => episode(`cr:G609CX3J4-${index + 12}`, 'cr:G24H1N3MP-G609CX3J4', {
        episodeNumber: index + 12, releaseDate: day, titles: [title('en', `Crunchyroll ${index + 12}`)],
      })),
      episode('cr:G609CX3J4-24', 'cr:G24H1N3MP-G609CX3J4', {
        episodeNumber: 24, releaseDate: '2021-05-01', titles: [title('en', 'Eris the Special')],
      }),
    ],
  })),
]

const samuraiAnswers = async () => [
  await answer('media', media('anilist:182616', {
    score: 0.8, type: 'TV', status: 'RELEASING', episodeCount: 12, startDate: SAMURAI[0],
    titles: [title('en', 'The Elusive Samurai')],
    handles: [
      sameAs(media('mal:60059', { score: 0.9 })),
      sameAs(media('anizip:18903', {})),
      sameAs(media('kitsu:49265', { score: 0.3 })),
      sameAs(media('cr:GQWH0M19X-GS00366034', { score: 0.5 })),
    ],
  })),
  await answer('media', media('mal:60059', {
    score: 0.9, type: 'TV', status: 'RELEASING', episodeCount: 12, startDate: SAMURAI[0],
    titles: [title('en', 'The Elusive Samurai')],
  })),
  await answer('media', media('anizip:18903', {
    type: 'TV', episodeCount: 12, titles: [title('en', 'The Elusive Samurai')],
    episodes: SAMURAI.map((day, index) => episode(`anizip:18903-${index + 1}`, 'anizip:18903', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Samurai ${index + 1}`)],
    })),
  })),
  // kitsu agrees about the length and is therefore a REFERENCE member, with numbers and no dates: it
  // is the row a pair must NOT name, since the day is what proved the pair
  await answer('media', media('kitsu:49265', {
    score: 0.3, type: 'TV', status: 'RELEASING', episodeCount: 12, titles: [title('en', 'The Elusive Samurai')],
    episodes: SAMURAI.map((day, index) => episode(`kitsu:49265-${index + 1}`, 'kitsu:49265', {
      episodeNumber: index + 1, titles: [title('en', `Samurai ${index + 1}`)],
    })),
  })),
  // eight aired when the seed was taken, numbered 13 to 20 on the same days: a MEMBER as shipped,
  // because guard 7 is silent in the SHORTER direction while the run is RELEASING (8.2)
  await answer('media', media('cr:GQWH0M19X-GS00366034', {
    score: 0.5, type: 'TV', status: 'RELEASING', episodeCount: 8, titles: [title('en', 'The Elusive Samurai')],
    episodes: SAMURAI.slice(0, 8).map((day, index) => episode(`cr:GS00366034-${index + 13}`, 'cr:GQWH0M19X-GS00366034', {
      episodeNumber: index + 13, releaseDate: day, titles: [title('en', `Samurai ${index + 1}`)],
    })),
  })),
]

// 8.3. The catalogue run's ids are not in the record, so the fixture names them; the Netflix title
// and the epid at position 14 are the record's. Netflix's rows carry OUR titles here, which is the
// only way the `retranslates` refusal can be shown to be what stops rule 2 rather than the data
const exorcistAnswers = async () => [
  await answer('media', media('anilist:6702', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 25, startDate: EXORCIST[0],
    titles: [title('en', 'Blue Exorcist')],
    handles: [sameAs(media('anizip:8351', {})), partOf(media('nf:70304252-1', { score: 0.2 }))],
  })),
  await answer('media', media('anizip:8351', {
    type: 'TV', episodeCount: 25, titles: [title('en', 'Blue Exorcist')],
    episodes: EXORCIST.map((day, index) => episode(`anizip:8351-${index + 1}`, 'anizip:8351', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Exorcist Chapter ${index + 1}`)],
    })),
  })),
  await answer('media', media('nf:70304252-1', {
    score: 0.2, type: 'TV', status: 'FINISHED', episodeCount: 26, titles: [title('en', 'Blue Exorcist Season 1')],
    episodes: Array.from({ length: 26 }, (_, index) => {
      const position = index + 1
      // position 14 is epid 80005451 "Runaway Kuro", a special that aired after the run ended
      const own = position === 14 ? 'Runaway Kuro' : `Exorcist Chapter ${position < 14 ? position : position - 1}`
      return episode(`nf:80005${400 + position}`, 'nf:70304252-1', {
        episodeNumber: position, titles: [title('en', own)],
      })
    }),
  })),
]

// 8.4. `mal:5114` is the record's; the AniList and ani.zip ids are not, so they carry a name. The
// record's five seasons are NETFLIX's and carry no date at any level, which is 8.3's outcome; they
// are dated under a folding catalogue here to reach the row of the verdict table Netflix can never
// reach: pairs found, the container NOT longer, so pairs only and no range
const fmaAnswers = async () => [
  await answer('media', media('mal:5114', {
    score: 0.9, type: 'TV', status: 'FINISHED', episodeCount: 64, startDate: FMA[0],
    titles: [title('en', 'Fullmetal Alchemist Brotherhood')],
    handles: [
      sameAs(media('anizip:fma', {})),
      ...Array.from({ length: 5 }, (_, index) => sameAs(media(`cr:FMA-S${index + 1}`, { score: 0.5 }))),
    ],
  })),
  await answer('media', media('anizip:fma', {
    type: 'TV', episodeCount: 64, titles: [title('en', 'Fullmetal Alchemist Brotherhood')],
    episodes: FMA.map((day, index) => episode(`anizip:fma-${index + 1}`, 'anizip:fma', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Alchemist ${index + 1}`)],
    })),
  })),
  ...await Promise.all(Array.from({ length: 5 }, (_, season) => {
    const length = season === 4 ? 12 : 13
    const days = FMA.slice(season * 13, season * 13 + length)
    return answer('media', media(`cr:FMA-S${season + 1}`, {
      score: 0.5, type: 'TV', status: 'FINISHED', episodeCount: length,
      titles: [title('en', `Fullmetal Alchemist Brotherhood Season ${season + 1}`)],
      episodes: days.map((day, index) => episode(`cr:FMA-S${season + 1}-${index + 1}`, `cr:FMA-S${season + 1}`, {
        episodeNumber: index + 1, releaseDate: day, titles: [title('en', `Crunchyroll ${season + 1}x${index + 1}`)],
      })),
    }))
  })),
]

// THE WINDOW. A reference member that LISTS one more row than the run's sources agree the run is
// long: the twelfth pair is outside `1..11` and is dropped rather than counted (`consensus.ts:185-191`)
const WINDOW = weekly('2022-01-05', 12)
const windowAnswers = async () => [
  await answer('media', media('anilist:900', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 11, startDate: WINDOW[0],
    titles: [title('en', 'Windowed')],
    handles: [sameAs(media('anizip:900', {})), partOf(media('cr:900', { score: 0.5 }))],
  })),
  await answer('media', media('anizip:900', {
    type: 'TV', episodeCount: 11, titles: [title('en', 'Windowed')],
    episodes: WINDOW.map((day, index) => episode(`anizip:900-${index + 1}`, 'anizip:900', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Windowed ${index + 1}`)],
    })),
  })),
  await answer('media', media('cr:900', {
    score: 0.5, type: 'TV', status: 'FINISHED', episodeCount: 12, titles: [title('en', 'Windowed Season 1')],
    episodes: WINDOW.map((day, index) => episode(`cr:900-${index + 1}`, 'cr:900', {
      episodeNumber: index + 1, releaseDate: day, titles: [title('en', `Windowed Stream ${index + 1}`)],
    })),
  })),
]

// THE TRANSITIONAL LEND of 4.4: Crunchyroll's season 1 of 24 re-pointed at the asking run, so the
// rows arrive as `HAS_EPISODE {claimer: 'cr'}` from an `anilist:` uri with no season row to hang a
// label off. Mushoku Tensei season 2 part 2, as `consensus.test.ts` holds it
const LEND_Cour1 = weekly('2023-07-09', 12)
const LEND_CouR2 = weekly('2024-04-07', 12)
const lendAnswers = async () => [
  await answer('media', media('anilist:166873', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 12, startDate: LEND_CouR2[0],
    titles: [title('en', 'Mushoku Tensei Season 2 Part 2')],
    handles: [sameAs(media('mal:55888', { score: 0.9 })), sameAs(media('anizip:18104', {}))],
  })),
  await answer('media', media('mal:55888', {
    score: 0.9, type: 'TV', status: 'FINISHED', episodeCount: 12, titles: [title('en', 'Mushoku Tensei Season 2 Part 2')],
  })),
  await answer('media', media('anizip:18104', {
    type: 'TV', episodeCount: 12, titles: [title('en', 'Mushoku Tensei Season 2 Part 2')],
    episodes: LEND_CouR2.map((day, index) => episode(`anizip:18104-${index + 1}`, 'anizip:18104', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Part Two ${index + 1}`)],
    })),
  })),
  await answer('media', media('cr:GSP1', {
    score: 0.5, type: 'TV', status: 'FINISHED', titles: [title('en', 'Mushoku Tensei Season 2')],
    episodes: [...LEND_Cour1, ...LEND_CouR2].map((day, index) => episode(`cr:GSP1-${index + 1}`, 'anilist:166873', {
      episodeNumber: index + 1, releaseDate: day, titles: [title('en', `Crunchyroll Season Two ${index + 1}`)],
    })),
  })),
]

// THE SCHEDULE SKEW, `anilist-208044` of the summer 2026 corpus. Crunchyroll publishes the STREAMING
// schedule from a Thursday and ani.zip the BROADCAST one from the following Wednesday at 15:00Z, so
// Crunchyroll's episode N+1 falls one day after ani.zip's episode N, inside the day of slack, while
// its own N falls six days before it. Both lists number 1 to 12, the run is 12 long, and the title at
// each number is the same on both sides. The ids are the record's; the record names the first and the
// last episode title, so the ten between them carry a name.
const SKEW_STREAM = weekly('2026-06-25', 12)
const SKEW_BROADCAST = weekly('2026-07-01', 12)
const SKEW_TITLES = [
  'Prologue', 'Lost Technology', 'The Buried City', 'A Borrowed Name', 'The Long March',
  'Ashes of the Keep', 'The Third Seal', 'Hollow Crown', 'The River Gate', 'What the Archive Kept',
  'The Last Convoy', 'I Am Eftal',
]
const skewAnswers = async () => [
  await answer('media', media('anilist:208044', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 12, startDate: SKEW_BROADCAST[0],
    titles: [title('en', 'The Eftal Record')],
    handles: [sameAs(media('anizip:19896', {}))],
  })),
  await answer('media', media('anizip:19896', {
    type: 'TV', episodeCount: 12, titles: [title('en', 'The Eftal Record')],
    episodes: SKEW_BROADCAST.map((day, index) => episode(`anizip:19896-${index + 1}`, 'anizip:19896', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', SKEW_TITLES[index]!)],
    })),
  })),
  // the lend: twelve `cr:` rows hung on the `anilist:` member, with no season row of their own (4.4)
  await answer('media', media('cr:GE00379300', {
    score: 0.5, type: 'TV', status: 'FINISHED', titles: [title('en', 'The Eftal Record')],
    episodes: SKEW_STREAM.map((day, index) => episode(`cr:GE003793${String(index + 2).padStart(2, '0')}JAJP`, 'anilist:208044', {
      episodeNumber: index + 1, releaseDate: day, titles: [title('en', SKEW_TITLES[index]!)],
    })),
  })),
]

// THE SAME SKEW ON A CLASS 1 CANDIDATE, which is the shape the corpus has no example of and the code
// reaches identically: a season row attached by an uncertain `PART_OF`, numbered 1 to 12 against a run
// of 12, on the streaming schedule. Its titles are its own, so rule 2 has nothing to fall back on and
// the skew becomes a WRITTEN refusal on the `LINK` rather than eleven pairs one late.
const SKEW_S_STREAM = weekly('2026-04-02', 12)
const SKEW_S_BROADCAST = weekly('2026-04-08', 12)
const skewSeasonAnswers = async () => [
  await answer('media', media('anilist:910', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 12, startDate: SKEW_S_BROADCAST[0],
    titles: [title('en', 'Skewed Season')],
    handles: [sameAs(media('anizip:910', {})), partOf(media('cr:910', { score: 0.5 }))],
  })),
  await answer('media', media('anizip:910', {
    type: 'TV', episodeCount: 12, titles: [title('en', 'Skewed Season')],
    episodes: SKEW_S_BROADCAST.map((day, index) => episode(`anizip:910-${index + 1}`, 'anizip:910', {
      episodeNumber: index + 1, releaseDate: anizipDay(day), titles: [title('en', `Skewed ${index + 1}`)],
    })),
  })),
  await answer('media', media('cr:910', {
    score: 0.5, type: 'TV', status: 'FINISHED', episodeCount: 12, titles: [title('en', 'Skewed Season One')],
    episodes: SKEW_S_STREAM.map((day, index) => episode(`cr:910-${index + 1}`, 'cr:910', {
      episodeNumber: index + 1, releaseDate: day, titles: [title('en', `Skewed Stream ${index + 1}`)],
    })),
  })),
]

// THE FOURTH INPUT of 5.4 P4: an episode `SAME_AS` a source stated. Two shapes, and the whole rule
// is which of the two it is: both rows inside one run cluster, or two runs nothing joins.
const CLAIMED = weekly('2026-01-06', 2)
const claimAnswers = async () => [
  await answer('media', media('anilist:950', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 2, startDate: CLAIMED[0],
    titles: [title('en', 'Asserted')],
    handles: [sameAs(media('mal:950', { score: 0.9 }))],
    episodes: [
      episode('anilist:950-1', 'anilist:950', {
        episodeNumber: 1, releaseDate: CLAIMED[0], titles: [title('en', 'Asserted One')],
        handles: [sameAs(episode('mal:950-1', 'mal:950', { episodeNumber: 1 }))],
      }),
    ],
  })),
  await answer('media', media('mal:950', {
    score: 0.9, type: 'TV', status: 'FINISHED', episodeCount: 2, titles: [title('en', 'Asserted')],
    episodes: [episode('mal:950-1', 'mal:950', { episodeNumber: 1, titles: [title('en', 'Asserted One')] })],
  })),
  // and the same claim across two runs nothing joins. Two ORIGINS, because two ids of one origin in
  // one component is guard 4's refusal (5.2) and this pair has to be weldable later
  await answer('media', media('anilist:960', {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 2, startDate: CLAIMED[0],
    titles: [title('en', 'Foreign Left')],
    episodes: [
      episode('anilist:960-1', 'anilist:960', {
        episodeNumber: 1, releaseDate: CLAIMED[0], titles: [title('en', 'Foreign One')],
        handles: [sameAs(episode('kitsu:970-1', 'kitsu:970', { episodeNumber: 1 }))],
      }),
    ],
  })),
  await answer('media', media('kitsu:970', {
    score: 0.3, type: 'TV', status: 'FINISHED', episodeCount: 2, startDate: CLAIMED[0],
    titles: [title('en', 'Foreign Right')],
    episodes: [episode('kitsu:970-1', 'kitsu:970', { episodeNumber: 1, titles: [title('en', 'Foreign One')] })],
  })),
]

beforeAll(async () => {
  await enableGraph(true)
  await ingestAnswers([
    ...await mushokuAnswers(),
    ...await samuraiAnswers(),
    ...await exorcistAnswers(),
    ...await fmaAnswers(),
    ...await windowAnswers(),
    ...await lendAnswers(),
    ...await skewAnswers(),
    ...await skewSeasonAnswers(),
    ...await claimAnswers(),
  ])
  resetPassState()
  await runPass()
}, 300_000)

afterAll(async () => {
  await closeGraph()
})

// ---------------------------------------------------------------------------------------------
// 8.1, the fold end to end.

// ONE SEASON, TWO COURS, TWO RANGES, TWENTY-THREE PAIRS. Crunchyroll's 1 to 11 are cour 1's and its
// 12 to 23 are cour 2's, and the only thing that says so is the day both sides published.
// Mutation: drop `DAY_SLACK` to 0 (the Tokyo day is one day later than ani.zip's stamp) and every one
// of the 23 pairs disappears, which is the whole fold going unproven.
test('8.1 Crunchyroll season 1 pairs eleven rows onto cour 1 and twelve onto cour 2', async () => {
  const pairs = await pairsFrom('cr:G24H1N3MP-G609CX3J4')
  expect(pairs).toHaveLength(23)

  const cour1 = pairs.filter(row => String(row.toUri).startsWith('anizip:14758'))
  expect(cour1.map(row => [Number(row.fromNumber), Number(row.toNumber)])).toEqual(
    Array.from({ length: 11 }, (_, index) => [index + 1, index + 1])
  )
  const cour2 = pairs.filter(row => String(row.toUri).startsWith('anizip:14759'))
  expect(cour2.map(row => [Number(row.fromNumber), Number(row.toNumber)])).toEqual(
    Array.from({ length: 12 }, (_, index) => [index + 12, index + 1])
  )

  // the evidence of 3.4, verbatim: the day the candidate published and how far it sits from ours
  expect(evidenceOf(cour1[0]!)).toEqual({ day: dayOf(MUSHOKU_C1_TOKYO[0]!), slack: 1 })
  expect(cour1.every(row => row.reason === 'dates' && Number(row.confidence) === 1)).toBe(true)
  // a trace descends by `supports`: their hang, our hang, and the `PART_OF` it was reached through
  expect((cour1[0]!.supports as string[]).length).toBeGreaterThanOrEqual(3)
})

// A BUTTON IS A PAIR, NEVER AN OFFSET (3.4): the special at position 24 costs ITSELF its link and
// nothing else, where an offset would have shifted every row after it.
// Mutation: pair a row whose day reaches no reference number onto its own number and the special
// lands on cour 1's non-existent episode 24, or on cour 2's 12 if an offset is applied instead.
test('8.1 the special at 24 pairs with nothing, and costs no other row its pair', async () => {
  const pairs = await pairsFrom('cr:G24H1N3MP-G609CX3J4')
  expect(pairs.some(row => Number(row.fromNumber) === 24)).toBe(false)
  expect(new Set(pairs.map(row => row.fromUri)).size, 'one edge per episode').toBe(23)
})

// THE RANGE OF 3.4, as literal properties, one per cour, with the `PART_OF` untouched under it.
// Mutation: take the hull from the candidate's own count (1 to 24) instead of from the pairs and cour
// 1's range reads `fromEnd: 24`, which labels the page "episodes 1 to 24" for an eleven episode run.
test('8.1 two INCLUDES rows carry the two ranges, and the PART_OF stays', async () => {
  const links = await rangeLinks()
  const cour1 = links.find(row => row.toUri === 'anilist:108465')
  const cour2 = links.find(row => row.toUri === 'anilist:127720')

  expect({
    kind: cour1?.kind, status: cour1?.status, reason: cour1?.reason,
    fromStart: Number(cour1?.fromStart), fromEnd: Number(cour1?.fromEnd),
    toStart: Number(cour1?.toStart), toEnd: Number(cour1?.toEnd),
    contiguous: cour1?.contiguous, aligned: Number(cour1?.aligned), total: Number(cour1?.total),
  }).toEqual({
    kind: 'INCLUDES', status: 'active', reason: 'dates',
    fromStart: 1, fromEnd: 11, toStart: 1, toEnd: 11, contiguous: true, aligned: 11, total: 24,
  })
  expect({
    fromStart: Number(cour2?.fromStart), fromEnd: Number(cour2?.fromEnd),
    toStart: Number(cour2?.toStart), toEnd: Number(cour2?.toEnd),
    contiguous: cour2?.contiguous, aligned: Number(cour2?.aligned), total: Number(cour2?.total),
  }).toEqual({ fromStart: 12, fromEnd: 23, toStart: 1, toEnd: 12, contiguous: true, aligned: 12, total: 24 })

  const claimed = await linksBetween('anilist:108465', 'cr:G24H1N3MP-G609CX3J4')
  const partOfRow = claimed.find(row => row.kind === 'PART_OF' && row.by === 'plugin:direct')
  expect({ status: partOfRow?.status, reason: partOfRow?.reason }).toEqual({ status: 'active', reason: 'asserted' })
})

// TWO `PART_OF` ROWS REACH ONE SEASON HERE (`plugin:direct`'s `asserted` and `plugin:containment`'s
// `span` on cour 2), the scan returns a row per link per episode, and the engine's order inside an
// ORDER BY tie is not stable between passes. Unsorted, `supports` flips between two spellings of one
// list and every edge derived from it is rewritten on every iteration.
// Mutation: drop `candidate.via.sort(compare)` and this reddens on the runs where the engine hands
// the two links over the other way, and the pass then reports `fixed-point-cap` (measured 2026-09-12:
// 11 rewritten `EPISODE_LINK` rows per iteration, on about half the runs).
test('the keys a pair was derived from are in a stable order', async () => {
  const reached = await linksBetween('anilist:127720', 'cr:G24H1N3MP-G609CX3J4')
  expect(reached.filter(row => row.kind === 'PART_OF' && row.status === 'active').map(row => row.reason).sort())
    .toEqual(['asserted', 'span'])

  const pairs = await pairsFrom('cr:G24H1N3MP-G609CX3J4')
  const cour2 = pairs.filter(row => String(row.toUri).startsWith('anizip:14759'))
  for (const row of cour2) {
    // their hang, our hang, then the `LINK` keys, which are the part that has to be ordered
    const supports = row.supports as string[]
    expect(supports).toHaveLength(4)
    expect(supports.slice(2)).toEqual([...supports.slice(2)].sort())
  }
  const range = (await rangeLinks()).find(row => row.toUri === 'anilist:127720')
  expect(range!.supports as string[]).toEqual([...(range!.supports as string[])].sort())
})

// ---------------------------------------------------------------------------------------------
// 8.2, the renumbering.

// THE ALIGNMENT AMONG MEMBERS is the same rule with a second member in place of the season, and it
// mints no `SAME_AS` because the row is already a member.
// Mutation: drop class 3 (a member origin whose numbering does not fit `1..runLength`) and the eight
// Crunchyroll rows keep 13 to 20, which is the twenty-row page `consensus.ts:93-97` records.
test('8.2 Crunchyroll 13 to 20 pairs with the run 1 to 8, and no range is drawn', async () => {
  const pairs = await pairsFrom('cr:GQWH0M19X-GS00366034')
  expect(pairs.map(row => [Number(row.fromNumber), Number(row.toNumber)])).toEqual(
    Array.from({ length: 8 }, (_, index) => [index + 13, index + 1])
  )
  // the pair names the row whose DAY proved it, never Kitsu's undated row of the same number
  expect(pairs.every(row => String(row.toUri).startsWith('anizip:18903'))).toBe(true)
  expect(evidenceOf(pairs[0]!)).toEqual({ day: dayOf(SAMURAI[0]!), slack: 0 })

  const links = await rangeLinks()
  expect(links.filter(row => row.fromUri === 'cr:GQWH0M19X-GS00366034'), 'a member is given no range').toEqual([])
})

// WHAT THE PAIRS ARE FOR (5.4 P5): a season row is in NO cluster, so its episodes reach the page
// only through them, at the pair's `toNumber` and marked `aligned by dates` in the trace. Eleven rows
// on cour 1 and twelve on cour 2, each naming its own hang and the pair beside it.
// Mutation: return an empty list from `alignedFillsOf` and 8.1's page loses every play button while
// the twenty-three pairs still sit in the graph proving nothing, which is what the store did before
// this step: a pair with no fill behind it is a measurement nobody reads.
test('8.1 the Crunchyroll rows fill both cours by their pairs, and the special fills nothing', async () => {
  const own = (uri: string): number => Number(uri.slice(uri.lastIndexOf('-') + 1))
  const all = (await fillsFrom('cr:G609CX3J4-')).sort((a, b) => own(a.uri) - own(b.uri))
  // the season row is a RUN cluster of its own and draws its own 24 rows there, which is the page a
  // season uri resolves to; the two cours are the clusters a pair had to reach
  const inCluster = (id: string) => all.filter(fill => fill.slot.startsWith(`${id}#`))
  const cour1 = inCluster(await clusterIdOf('anilist:108465'))
  const cour2 = inCluster(await clusterIdOf('anilist:127720'))
  expect([...cour1, ...cour2].every(fill => fill.via === 'aligned'), 'no member of either cour hung one of these')
    .toBe(true)

  expect(cour1.map(fill => [own(fill.uri), fill.number]), 'their 1 to 11 onto the run 1 to 11').toEqual(
    Array.from({ length: 11 }, (_, index) => [index + 1, index + 1])
  )
  // cour 2: their 12 to 23 land on slots 1 to 12, which is the renumbering the user sees
  expect(cour2.map(fill => [own(fill.uri), fill.number])).toEqual(
    Array.from({ length: 12 }, (_, index) => [index + 12, index + 1])
  )
  expect(new Set(cour1.map(fill => fill.slot)).size, 'eleven distinct slots').toBe(11)
  expect(new Set(cour2.map(fill => fill.slot)).size, 'and twelve more, in the other cluster').toBe(12)
  expect([...cour1, ...cour2].some(fill => fill.uri === 'cr:G609CX3J4-24'),
    'the special pairs with nothing and reaches neither cour').toBe(false)

  // A TRACE DESCENDS FROM THE BUTTON TO THE CLAIM (3.2): the row's own hang and the pair that placed it
  const [pair] = await rowsOf(
    `MATCH (a:Episode {uri: 'cr:G609CX3J4-1'})-[l:EPISODE_LINK]->(b:Episode {uri: 'anizip:14758-1'})
     RETURN l.key AS key`
  )
  const first = cour1.find(fill => fill.uri === 'cr:G609CX3J4-1')!
  expect(first.supports, 'the hang and the pair, and nothing invented').toHaveLength(2)
  expect(first.supports, 'the pair is named by its key').toContain(String(pair!.key))

  // AND THE VIEW SAYS SO (6.4): the materialized row carries `via` per handle, which is what draws
  // "aligned by dates" under the play button rather than a badge nobody can explain
  const [cluster] = await rowsOf(
    "MATCH (m:Media {uri: 'anilist:108465'})-[:MEMBER_OF]->(c:Cluster) RETURN c.episodes AS episodes"
  )
  const episodes = JSON.parse(String(cluster!.episodes)) as { handles: { via: string, node: { uri: string } }[] }[]
  const handles = episodes[0]!.handles
  expect(handles.find(handle => handle.node.uri === 'cr:G609CX3J4-1')?.via).toBe('aligned')
  expect(handles.find(handle => handle.node.uri === 'anizip:14758-1')?.via).toBe('member')
})

// A FOREIGN ROW WITH NO PAIR FILLS NOTHING (4.4, 5.4 P5). The lent season's first twelve rows are the
// PREVIOUS cour's: they are hung on this run's member, they carry dates and numbers, and the only
// thing that keeps them off the page is that no day of theirs met a reference day.
// Mutation: pair every episode with every row carrying the same number (drop the `EPISODE_LINK` join
// from `readAlignedRows` and take `b.episodeNumber` as the target) and all twenty-four land on cour
// 2's twelve rows, which is the positional loan verbatim: cour 1's episodes under cour 2's urls.
test('a lent row that pairs with nothing reaches no slot, while its paired neighbours do', async () => {
  const fills = await fillsFrom('cr:GSP1-')
  const numbered = fills.map(fill => Number(fill.uri.split('-')[1])).sort((a, b) => a - b)
  expect(numbered, 'only the twelve that paired').toEqual(Array.from({ length: 12 }, (_, index) => index + 13))
  expect(fills.every(fill => fill.via === 'aligned')).toBe(true)
  expect(fills.map(fill => fill.number).sort((a, b) => (a ?? 0) - (b ?? 0)))
    .toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
  expect(fills.every(fill => fill.supports.length === 2), 'the hang and the pair').toBe(true)
})

// 8.2 THROUGH THE VIEW: the Crunchyroll rows are MEMBERS here, so they fill by the member rule, and
// the number they fill at is the pair's (`consensus.ts:247-251`, "the stored node keeps Crunchyroll's
// own number"). `via` says where the number came from (3.2), which is the pair and not the row.
// Mutation: drop the `renumber` lookup in `slotsOf`'s `numberOf` and the eight rows sit at 13 to 20,
// which is the twenty-row page; keep the renumbering and stamp `member` and the trace claims
// Crunchyroll numbered them 1 to 8 itself.
test('8.2 the renumbered member rows fill 1 to 8, and say a pair put them there', async () => {
  const fills = await fillsFrom('cr:GS00366034-')
  expect(fills.map(fill => [Number(fill.uri.split('-')[1]), fill.number])).toEqual(
    Array.from({ length: 8 }, (_, index) => [index + 13, index + 1])
  )
  expect(fills.every(fill => fill.via === 'aligned')).toBe(true)
  expect(fills.every(fill => fill.slotNumber === fill.number), 'each shares the slot it renumbered onto').toBe(true)
  expect(fills.every(fill => fill.supports.length === 2), 'its own hang and the pair').toBe(true)

  // and the slot it joined is anizip's, which is what makes it one row rather than twenty
  const [slot] = await rowsOf(
    `MATCH (e:Episode {uri: 'cr:GS00366034-13'})-[:FILLS]->(s:Slot)<-[:FILLS]-(o:Episode)
     RETURN collect(o.uri) AS uris`
  )
  expect((slot!.uris as string[]).sort()).toEqual(['anizip:18903-1', 'cr:GS00366034-13', 'kitsu:49265-1'])
})

// ---------------------------------------------------------------------------------------------
// 8.3, the special that broke the offset vote.

// NETFLIX MINTS NOTHING, and the refusal is a row rather than a silence. The rows here carry OUR
// titles, so 25 of 26 would match exactly and rule 2 would fire at 0.96 coverage: the only thing
// stopping it is `retranslates`, measured at 4 exact of 25 with the best wrong pair above the true
// one (2026-09-10).
// Mutation: delete the `retranslates` branch of `decideCandidate` and 25 pairs appear, 13 of them on
// the wrong row, which is exactly the failure 8.3 records.
test('8.3 Netflix pairs nothing and writes why: retranslates', async () => {
  const pairs = await pairsFrom('nf:70304252-1')
  expect(pairs).toEqual([])

  const refusedRow = (await rangeLinks()).find(row => row.fromUri === 'nf:70304252-1')
  expect({ kind: refusedRow?.kind, status: refusedRow?.status, reason: refusedRow?.reason }).toEqual({
    kind: 'INCLUDES', status: 'refused', reason: 'retranslates',
  })
  expect(evidenceOf(refusedRow!)).toEqual({ reason: 'retranslates', theirs: 26, ours: 25 })

  const claimed = await linksBetween('anilist:6702', 'nf:70304252-1')
  expect(claimed.find(row => row.by === 'plugin:direct' && row.kind === 'PART_OF')?.status).toBe('active')
})

// ---------------------------------------------------------------------------------------------
// 8.4, 64 episodes in five seasons.

// PAIRS FOUND AND THE CONTAINER NOT LONGER: pairs only, and the `PART_OF` stays. Every one of season
// 1's thirteen rows pairs, which under the deleted rule 3 would have made it the same thing as a run
// of 64.
// Mutation: restore "every episode paired, therefore SAME_AS" and a 13 episode season welds into a 64
// episode run, which is the BAKI weld (2026-09-10) by another route. Mutation for the range half:
// emit the hull whenever pairs are found, whatever the candidate's length, and five seasons label a
// run they are pieces of, which also stops the pass reaching a fixed point (measured 2026-09-12).
test('8.4 five seasons pair by date, none is given a range, and none becomes a SAME_AS', async () => {
  const paired = await Promise.all([1, 2, 3, 4, 5].map(season => pairsFrom(`cr:FMA-S${season}`)))
  expect(paired.map(pairs => pairs.length)).toEqual([13, 13, 13, 13, 12])
  // season 2 numbers its own rows 1 to 13 and they are the run's 14 to 26: there is no offset
  // anywhere, only pairs, so a season's own numbering never reaches the page
  expect(paired[1]!.map(row => [Number(row.fromNumber), Number(row.toNumber)])).toEqual(
    Array.from({ length: 13 }, (_, index) => [index + 1, index + 14])
  )

  const links = await rangeLinks()
  expect(links.filter(row => String(row.fromUri).startsWith('cr:FMA-')), 'a shorter season labels nothing').toEqual([])
  const sameAsRows = await rowsOf(
    `MATCH (a:Media)-[l:LINK]->(b:Media)
     WHERE l.kind = 'SAME_AS' AND l.status = 'active' AND b.uri STARTS WITH 'cr:FMA-'
     RETURN a.uri AS fromUri, b.uri AS toUri, l.by AS by`
  )
  expect(sameAsRows, 'no upgrade to SAME_AS at any coverage').toEqual([])
})

// NO PLUGIN MINTS A MEDIA `SAME_AS` HERE, anywhere in the graph, whatever the pairs prove (rule 3 was
// deleted from 5.4 P4).
// Mutation: propose one `SAME_AS` from a proven candidate and this case names it.
test('plugin:range never mints a SAME_AS between media', async () => {
  const minted = await rowsOf(
    "MATCH (a:Media)-[l:LINK]->(b:Media) WHERE l.by = 'plugin:range' AND l.kind <> 'INCLUDES' RETURN l.kind AS kind"
  )
  expect(minted).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// The window, the lend, and the pass.

// A PAIR ONTO A ROW OUTSIDE `1..runLength` IS DROPPED (`consensus.ts:185-191`). ani.zip lists twelve
// rows for a run its own sources say is eleven long, so the twelfth pair would put a playable url on
// a row the run does not have.
// Mutation: apply the window after the `MIN_ALIGNED` test instead of before it, or drop it, and the
// twelfth pair survives and the range reads `aligned: 12, toEnd: 12` for an eleven episode run.
test('a pair whose toNumber falls outside the run is dropped, and the range shrinks with it', async () => {
  const pairs = await pairsFrom('cr:900')
  expect(pairs.map(row => Number(row.toNumber))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

  const range = (await rangeLinks()).find(row => row.fromUri === 'cr:900')
  expect({ toEnd: Number(range?.toEnd), aligned: Number(range?.aligned), total: Number(range?.total) })
    .toEqual({ toEnd: 11, aligned: 11, total: 12 })
})

// THE TRANSITIONAL LEND (4.4): rows a FOREIGN claimer hung on a member are evidence and never a slot.
// The season's first twelve are the PREVIOUS cour's and pair with nothing, which is the positional
// loan's whole defect: it put cour 1's episodes on cour 2's page with playable urls.
// Mutation: drop the class 2 scan and the twelve provable buttons disappear; accept the lend by
// NUMBER instead of by day and cour 1's twelve land on cour 2's rows 1 to 12.
test('a lent season is paired by day and given no range', async () => {
  const pairs = await rowsOf(
    `MATCH (a:Episode)-[l:EPISODE_LINK]->(b:Episode)
     WHERE l.by = 'plugin:range' AND a.uri STARTS WITH 'cr:GSP1-'
     RETURN a.uri AS fromUri, b.uri AS toUri, l.fromNumber AS fromNumber, l.toNumber AS toNumber
     ORDER BY l.fromNumber`
  )
  expect(pairs.map(row => [Number(row.fromNumber), Number(row.toNumber)])).toEqual(
    Array.from({ length: 12 }, (_, index) => [index + 13, index + 1])
  )
  expect(pairs.every(row => String(row.toUri).startsWith('anizip:18104'))).toBe(true)
  expect((await rangeLinks()).filter(row => row.fromUri === 'cr:GSP1'), 'no season row, no label').toEqual([])
})

// THE SCHEDULE SKEW, AND THE VIDEO IT PUT ON THE WRONG ROW. Crunchyroll streams from a Thursday and
// ani.zip broadcasts from the Wednesday six days later, so Crunchyroll's N+1 falls one day after
// ani.zip's N: rule 1 minted eleven pairs `N+1` to `N`, Crunchyroll's "Prologue" paired with nothing,
// and `plugin:aggregate` filled slot 1 from episode 2. Both lists number 1 to 12 and the titles agree
// at each number, so rule 2 was right and rule 1 ran first (`anilist-208044`, summer 2026 corpus).
// Mutation: delete the `scheduleSkew` call from `decideCandidate` and the twelve pairs become eleven
// reading `[2,1] [3,2] ... [12,11]` by `dates`, with slot 1 carrying the second video.
test('a streaming schedule a few days off the broadcast one does not renumber the lend', async () => {
  const pairs = await rowsOf(
    `MATCH (a:Episode)-[l:EPISODE_LINK]->(b:Episode)
     WHERE l.by = 'plugin:range' AND a.uri STARTS WITH 'cr:GE003793'
     RETURN a.uri AS fromUri, b.uri AS toUri, l.fromNumber AS fromNumber, l.toNumber AS toNumber,
       l.reason AS reason, l.status AS status
     ORDER BY l.fromNumber`
  )
  expect(pairs.map(row => [Number(row.fromNumber), Number(row.toNumber)]))
    .toEqual(Array.from({ length: 12 }, (_, index) => [index + 1, index + 1]))
  expect(pairs.map(row => [String(row.reason), String(row.status)]))
    .toEqual(pairs.map(() => ['titles', 'active']))
  expect(pairs[0]!.fromUri, 'Crunchyroll\'s own first row').toBe('cr:GE00379302JAJP')
  expect(pairs[0]!.toUri, 'and ani.zip\'s first, not its second').toBe('anizip:19896-1')

  // WHAT THE BUG COST: the slot the user opens first. A pair one late puts episode 2's video here
  const fills = await fillsFrom('cr:GE003793')
  expect(fills.map(fill => [fill.uri, fill.number]))
    .toEqual(SKEW_TITLES.map((_, index) => [`cr:GE003793${String(index + 2).padStart(2, '0')}JAJP`, index + 1]))
  expect(fills.every(fill => fill.via === 'aligned'), 'a pair placed every one of them').toBe(true)
  const [slotOne] = await rowsOf(
    `MATCH (e:Episode {uri: 'cr:GE00379302JAJP'})-[:FILLS]->(s:Slot)<-[:FILLS]-(o:Episode)
     RETURN s.number AS number, collect(o.uri) AS uris`
  )
  expect(Number(slotOne!.number)).toBe(1)
  expect((slotOne!.uris as string[]).sort()).toEqual(['anizip:19896-1', 'cr:GE00379302JAJP'])
})

// THE SAME SKEW REACHES CLASS 1, and there the candidate has a row to write the refusal on. Nothing
// in `decideCandidate` knows which class asked it, which is why the guard lives in the rule and not
// in the candidate scan: a season attached by an uncertain `PART_OF` is renumbered by exactly the
// same eleven pairs. Its titles are its own, so rule 2 cannot rescue it and the honest answer is none.
// Mutation: delete the `scheduleSkew` call and eleven `dates` pairs appear reading `[2,1] ... [12,11]`
// with no refusal at all. Replace the guard with a `numbersOutsideRun` test on the class 2 scan, which
// is the shape of fix a lend-only reading suggests, and this case is renumbered exactly as before
// while the lend above loses all twelve of its pairs instead of getting the right ones (measured).
test('the skew reaches a season candidate too, and is refused in writing', async () => {
  expect(await pairsBetween('cr:910-', 'anizip:910-'), 'nothing rather than a guess').toEqual([])
  const refusal = (await rangeLinks()).filter(row => row.fromUri === 'cr:910')
  expect(refusal.map(row => [String(row.kind), String(row.status), String(row.reason)]))
    .toEqual([['INCLUDES', 'refused', 'date-skew']])
  expect(evidenceOf(refusal[0]!)).toMatchObject({ reason: 'date-skew', theirs: 12, ours: 12 })
  // and the `PART_OF` that reached it is untouched, in this branch as in every other
  expect((await linksBetween('anilist:910', 'cr:910')).some(row => row.kind === 'PART_OF' && row.status === 'active'))
    .toBe(true)
})

// THE SAME GRAPH TWICE IS THE SAME VIEW (5.1): the output is a desired set, so a second pass that
// wrote anything would mean the rule read something other than the graph.
// Mutation: key a pair on the arrival order of the scan (drop the `ORDER BY`, or the lowest-uri
// tie-break in `pairsByDay`) and a second pass rewrites edges.
test('a second pass over the same graph writes nothing', async () => {
  const again = await runPass()
  expect(again.changes).toEqual([])
  const { query } = await graphReady()
  expect((await checkInvariants(query)).counts).toEqual({
    'includes-inside': 0, 'part-of-inside': 0, 'cross-scope-link': 0, 'double-membership': 0,
  })
})

// ---------------------------------------------------------------------------------------------
// The fourth input: `EPISODE_CLAIMS`, placed rather than proven.

// A CLAIM INSIDE ONE RUN IS A PAIR, AND A CLAIM ACROSS TWO RUNS IS A REFUSAL WRITTEN DOWN. That is
// `db.ts:410`'s union with the guards it never had ("accepts a uri that was never set"), and the
// refused row is what makes "why is there no button here" a query rather than a silence.
// Mutation: return true from `placesClaim` and the foreign claim welds two runs' episodes, which is
// the union that had no guard; drop `status` from the writer's `EPISODE_LINK` row and the refusal is
// written ACTIVE, so a source's word alone places a play button.
test('an episode claim inside one cluster is asserted, and one across two runs is refused', async () => {
  const [asserted] = await pairsBetween('anilist:950-1', 'mal:950-1')
  expect({ status: asserted?.status, reason: asserted?.reason, by: asserted?.by }).toEqual({
    status: 'active', reason: 'asserted', by: 'plugin:range',
  })
  expect(Number(asserted?.confidence)).toBe(1)
  expect([Number(asserted?.fromNumber), Number(asserted?.toNumber)], "the two rows' own numbers").toEqual([1, 1])

  // `supports` names the claim, which is what a trace descends to the Answer through (3.2)
  const [claim] = await rowsOf(
    `MATCH (a:Episode {uri: 'anilist:950-1'})-[c:EPISODE_CLAIMS]->(b:Episode {uri: 'mal:950-1'})
     RETURN c.key AS key, c.kind AS kind, c.claimer AS claimer`
  )
  expect(claim!.kind).toBe('SAME_AS')
  expect(asserted?.supports).toEqual([String(claim!.key)])

  const [foreign] = await pairsBetween('anilist:960-1', 'kitsu:970-1')
  expect({ status: foreign?.status, reason: foreign?.reason }).toEqual({
    status: 'refused', reason: 'foreign-episode',
  })

  // and the refusal places nothing: a refused pair is not read by the view (5.4 P5)
  const fills = await fillsFrom('anilist:960-1')
  expect(fills.map(fill => fill.via), 'its own slot as a member, and no slot of the other run').toEqual(['member'])
})

// THE REFUSAL IS RE-DECIDED EVERY PASS, because its premise is the membership and nothing else: the
// two rows becoming one cluster flips it to active, and the cluster splitting flips it back. The row
// is UPDATED in place rather than deleted and re-created, which is the writer's diff on a property
// that moved (5.2) and what keeps a trace's key stable across the flip.
// Mutation: place a claimed row by the MEDIA it hangs on rather than by that media's CLUSTER (return
// `m.uri` from `MEMBER_EPISODE_SCAN`) and the weld places nothing, because two members of one cluster
// are then two different places, which is the union-by-uri this rule replaces.
test('a refused episode claim flips to active when the two rows become one cluster, and back', async () => {
  const statusOf = async () => (await pairsBetween('anilist:960-1', 'kitsu:970-1'))[0]
  const before = await statusOf()
  expect(before?.status).toBe('refused')

  // the weld: a source claim joining the two runs, which is `plugin:direct`'s class 0
  await ingestAnswers([
    await answer('media', media('anilist:960', {
      score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 2, startDate: CLAIMED[0],
      titles: [title('en', 'Foreign Left')],
      handles: [sameAs(media('kitsu:970', { score: 0.3 }))],
    })),
  ])
  await runPass()
  const welded = await statusOf()
  expect({ status: welded?.status, reason: welded?.reason }).toEqual({ status: 'active', reason: 'asserted' })
  expect(welded?.key, 'the same edge, updated in place').toBe(before?.key)

  // and the split, with only the two plugins that read membership: `plugin:direct` re-proposes from
  // the claim every pass, which is the sticky rule doing its job (5.2)
  const { query } = await graphReady()
  await query(
    `MATCH (a:Media {uri: 'anilist:960'})-[l:LINK]->(b:Media {uri: 'kitsu:970'})
     WHERE l.kind = 'SAME_AS' AND l.status = 'active' DELETE l`
  )
  await runPlugins([aggregatePlugin, rangePlugin], { reason: 'manual' })
  const split = await statusOf()
  expect({ status: split?.status, reason: split?.reason }).toEqual({ status: 'refused', reason: 'foreign-episode' })

  // back to the fixed point the cases after this one read
  await runPass()
  expect((await statusOf())?.status).toBe('active')
  // three full passes, which is over the 5 s default when the suites run side by side
}, 300_000)

// ---------------------------------------------------------------------------------------------
// The rules themselves, without an engine: every refusal `consensus.ts:105-110` records, and the two
// halves of rule 2's bar.

const side = (uri: string, number: number | null, day: string | null, keys: string[] = []): SideEpisode =>
  ({ uri, origin: uri.slice(0, uri.indexOf(':')), number, day: day === null ? null : dayOf(day), keys, hung: `h:${uri}` })

const listed = (prefix: string, from: number, days: string[]): SideEpisode[] =>
  days.map((day, index) => side(`${prefix}-${from + index}`, from + index, day))

// NOTHING RATHER THAN A GUESS, in every ambiguous case (`consensus.ts:105-110`).
// Mutation: drop the `reachable.size > 1` refusal and the doubled day pairs on whichever number the
// map happened to hold first; drop the `MIN_ALIGNED` bar and one shared day carries a whole season.
test('rule 1 refuses one shared day, a day naming two references, and an undated side', () => {
  const reference = listed('anizip:1', 1, weekly('2026-07-17', 12))

  const alone = pairsByDay(reference, listed('cr:1', 13, ['2026-07-17']))
  expect(alone.pairs).toHaveLength(1)
  expect(decideCandidate({ runLength: 12, reference, candidate: { retranslates: false, episodes: alone.pairs.map(pair => pair.from) } }).ok)
    .toBe(false)
  expect(alone.pairs.length < MIN_ALIGNED, 'one shared date is a coincidence').toBe(true)

  // Hana-Kimi season 2 has episodes 1 and 2 both dated 2026-07-01, and Mushoku season 3 aired its
  // first two on one day: a day the run uses twice cannot say which episode a date belongs to
  const twice = [side('anizip:2-1', 1, '2026-07-01'), side('anizip:2-2', 2, '2026-07-01')]
  const doubled = pairsByDay(twice, [side('cr:2-5', 5, '2026-07-01'), side('cr:2-6', 6, '2026-07-01')])
  expect(doubled.pairs).toEqual([])
  expect(doubled.ambiguous, 'and it is reported as an ambiguity rather than as an absence').toBe(2)
  expect(decideCandidate({ runLength: 12, reference: twice, candidate: { retranslates: false, episodes: [side('cr:2-5', 5, '2026-07-01')] } }))
    .toEqual({ ok: false, reason: 'ambiguous-day' })

  const undated = [side('cr:3-13', 13, null)]
  expect(pairsByDay(reference, undated).pairs).toEqual([])
  expect(pairsByDay(undated, listed('cr:3', 1, weekly('2026-07-17', 3))).pairs).toEqual([])
  expect(decideCandidate({ runLength: 12, reference: [], candidate: { retranslates: false, episodes: undated } }))
    .toEqual({ ok: false, reason: 'no-dates' })
})

// THE DAY OF SLACK IS THE TOKYO BOUNDARY (`consensus.ts:136-140`), and it is accepted in both
// directions while the neighbour a week away stays out of reach.
// Mutation: set `DAY_SLACK` to 0 and the Crunchyroll pairing of 8.1 stops entirely; set it to 3 and
// two weekly episodes become reachable from one day, which the ambiguity refusal then eats.
test('rule 1 accepts a day of slack and records which way it went', () => {
  const reference = listed('anizip:4', 1, weekly('2021-01-10', 4))
  const tokyo = pairsByDay(reference, listed('cr:4', 1, weekly('2021-01-11', 4)))
  expect(tokyo.pairs.map(pair => [pair.fromNumber, pair.toNumber, (pair.evidence as { slack: number }).slack]))
    .toEqual([[1, 1, 1], [2, 2, 1], [3, 3, 1], [4, 4, 1]])

  const early = pairsByDay(reference, [side('cr:5-1', 1, '2021-01-09')])
  expect((early.pairs[0]!.evidence as { slack: number }).slack, 'a day early is a day of slack too').toBe(-1)
})

// RULE 2'S BAR IS TWO HALVES, and both are the measured constants (`similar.ts:59-69`).
// Mutation: lower `MIN_EPISODE_TITLE_MATCHES` to 2 and two shared recap names mint a season; drop the
// coverage half and a fold of two equal cours at 12/24 mints the fold the date rule is there to prove.
test('rule 2 needs three exact matches and 0.6 coverage of the candidate', () => {
  const reference = Array.from({ length: 24 }, (_, index) => side(`anizip:6-${index + 1}`, index + 1, null, [`title ${index + 1}`]))

  const two = Array.from({ length: 3 }, (_, index) => side(`cr:6-${index + 1}`, index + 1, null, index < 2 ? [`title ${index + 1}`] : ['unshared']))
  expect(pairsByTitle(reference, two).pairs).toHaveLength(2)
  expect(decideCandidate({ runLength: 24, reference, candidate: { retranslates: false, episodes: two } }))
    .toEqual({ ok: false, reason: 'no-titles' })

  const three = Array.from({ length: 3 }, (_, index) => side(`cr:7-${index + 1}`, index + 1, null, [`title ${index + 1}`]))
  const verdict = decideCandidate({ runLength: 24, reference, candidate: { retranslates: false, episodes: three } })
  expect(verdict.ok && verdict.rule).toBe('titles')
  expect(verdict.ok && verdict.pairs.map(pair => pair.toNumber)).toEqual([1, 2, 3])

  // THE FOLD'S SIGNATURE: twelve of a 24 row season match, which is 0.50 and refused, while a season
  // with a four episode bonus block scores 12/16 = 0.75 and is admitted (`similar.ts:60-66`)
  const fold = Array.from({ length: 24 }, (_, index) => side(`cr:8-${index + 1}`, index + 1, null, [`title ${index + 1}`]))
    .map((row, index) => (index < 12 ? row : side(row.uri, row.number, null, [`bonus ${index}`])))
  expect(pairsByTitle(reference, fold).coverage).toBeCloseTo(0.5, 5)
  expect(decideCandidate({ runLength: 24, reference, candidate: { retranslates: false, episodes: fold } }))
    .toEqual({ ok: false, reason: 'no-titles' })

  const bonus = fold.slice(0, 16)
  expect(pairsByTitle(reference, bonus).coverage).toBeCloseTo(0.75, 5)
  expect(decideCandidate({ runLength: 24, reference, candidate: { retranslates: false, episodes: bonus } }).ok).toBe(true)
})

// A KEY PRESENT TWICE ON EITHER SIDE CARRIES NO IDENTITY THERE, so it is skipped rather than guessed
// at, and a candidate reaching two different reference rows through two keys is an ambiguity.
// Mutation: keep the first row a duplicated key names and "Recap" pairs with whichever of the two
// rows the scan reached first, which is an arrival-order answer to an identity question.
test('rule 2 skips a key present twice, on either side', () => {
  const reference = [
    side('anizip:9-1', 1, null, ['recap']), side('anizip:9-2', 2, null, ['recap']),
    side('anizip:9-3', 3, null, ['third']), side('anizip:9-4', 4, null, ['fourth']),
  ]
  const theirs = [
    side('cr:9-1', 1, null, ['recap']), side('cr:9-2', 2, null, ['third']),
    side('cr:9-3', 3, null, ['fourth']), side('cr:9-4', 4, null, ['third', 'fourth']),
  ]
  const { pairs } = pairsByTitle(reference, theirs)
  // 'recap' is twice on ours, and 'third'/'fourth' are each twice on theirs once cr:9-4 carries both
  expect(pairs.map(pair => [pair.from.uri, pair.to.uri])).toEqual([])
})

// THE PORTED RULE AND THE ONE IT REPLACES AGREE WHEREVER THE OLD ONE ANSWERS (`consensus.test.ts`'s
// own fixtures), and differ in exactly one place, on purpose.
// Mutation: change the day window or the distinct-numbers-per-day map and the first assertion fails
// on the Elusive Samurai fixture, which is the case the offset rule was written for.
test('rule 1 and alignmentOffset agree on every fixture the old rule answers', () => {
  const WEEKLY = weekly('2026-07-17', 12)
  const asEpisode = (row: SideEpisode): Episode => ({
    uri: row.uri,
    origin: row.origin,
    mediaUri: row.origin,
    episodeNumber: row.number,
    releaseDate: row.day === null ? undefined : new Date(row.day * MS_PER_DAY).toISOString(),
  } as unknown as Episode)

  const agrees = (reference: SideEpisode[], theirs: SideEpisode[]) => {
    const offset = alignmentOffset(reference.map(asEpisode), theirs.map(asEpisode))
    const { pairs } = pairsByDay(reference, theirs)
    return { offset, offsets: new Set(pairs.map(pair => pair.fromNumber - pair.toNumber)), pairs: pairs.length }
  }

  // the renumbering the offset rule exists for: one offset, and every pair carries it
  const samurai = agrees(listed('anizip:18903', 1, WEEKLY), listed('cr:GS00366034', 13, WEEKLY.slice(0, 8)))
  expect(samurai.offset).toBe(12)
  expect([...samurai.offsets]).toEqual([12])
  expect(samurai.pairs).toBe(8)

  // a source already counting the same way
  const zero = agrees(listed('anizip:a', 1, WEEKLY), listed('cr:a', 1, WEEKLY))
  expect(zero.offset).toBe(0)
  expect([...zero.offsets]).toEqual([0])

  // and every refusal the old rule makes for a PER-DAY reason is a refusal here too
  const doubled = agrees(
    [side('anizip:b-1', 1, '2026-07-01'), side('anizip:b-2', 2, '2026-07-01')],
    [side('cr:b-5', 5, '2026-07-01'), side('cr:b-6', 6, '2026-07-01')]
  )
  expect(doubled.offset).toBeUndefined()
  expect(doubled.pairs).toBe(0)

  const once = agrees(listed('anizip:c', 1, WEEKLY), listed('cr:c', 13, [WEEKLY[0]!]))
  expect(once.offset).toBeUndefined()
  expect(once.pairs, 'one pair, which is under MIN_ALIGNED and mints nothing').toBe(1)

  // THE ONE DELIBERATE DIFFERENCE. Two offsets explaining one set of dates is a refusal for the OLD
  // rule, because it had to pick one number for the whole list. Here it is two runs of pairs and no
  // number at all, which is the piecewise mapping of 3.4 and what 8.3 asks for
  const split = agrees(
    listed('anizip:d', 1, weekly('2026-07-01', 4)),
    [...listed('cr:d', 5, weekly('2026-07-01', 2)), ...listed('cr:d', 9, weekly('2026-07-15', 2))]
  )
  expect(split.offset, 'offset 4 twice and offset 6 twice').toBeUndefined()
  expect(split.pairs).toBe(4)
  expect([...split.offsets].sort((a, b) => a - b)).toEqual([4, 6])
})

// THE HULL IS A STATEMENT ABOUT THE PAIRS, not about the span: a range with a hole in it says so.
// Mutation: hard-code `contiguous: true` and the piecewise mapping an inserted special produces
// reads as a solid block, which is the claim 8.3 exists to refuse.
test('the hull reports a gap rather than smoothing it', () => {
  const reference = listed('anizip:e', 1, weekly('2011-04-17', 25))
  const theirs = [
    ...listed('cr:e', 1, weekly('2011-04-17', 13)),
    side('cr:e-14', 14, '2012-01-01'),
    ...listed('cr:e', 15, weekly('2011-07-17', 12)),
  ]
  const { pairs } = pairsByDay(reference, theirs)
  const hull = hullOf(pairs, 26)!
  expect(hull.aligned).toBe(25)
  expect(hull.contiguous, 'position 14 pairs with nothing, so the range is not solid').toBe(false)
  // and the first of the two runs of pairs, taken alone, IS solid: the piecewise mapping of 8.3
  expect(hullOf(pairs.filter(pair => pair.fromNumber <= 13), 26))
    .toMatchObject({ fromStart: 1, fromEnd: 13, toStart: 1, toEnd: 13, contiguous: true })
})

// PLACING A CLAIM IS THREE CASES AND A REFUSAL, and the refusal is the interesting one: two rows that
// only share an ATTACHMENT are two seasons hanging off one run, which is the fold this file proves
// episode by episode. A source asserting across it is asserting the thing a pair demonstrates.
// Mutation: admit two attached rows as well and a Crunchyroll season's episode pairs with a Netflix
// season's on nothing but both being `PART_OF` the same run; drop the member-to-attached case and
// 8.1's season rows can never be claimed onto the run at all.
test('a claim is placed inside one cluster, or across one attachment, and nowhere else', () => {
  const place = (members: string[], attached: string[] = []) => ({ members, attached })
  expect(placesClaim(place(['cl:a']), place(['cl:a'])), 'both rows on members of one cluster').toBe(true)
  expect(placesClaim(place(['cl:a']), place([], ['cl:a'])), 'a member and a season attached to it').toBe(true)
  expect(placesClaim(place([], ['cl:a']), place(['cl:a'])), 'and the same the other way round').toBe(true)
  expect(placesClaim(place([], ['cl:a']), place([], ['cl:a'])), 'two seasons attached to one run').toBe(false)
  expect(placesClaim(place(['cl:a']), place(['cl:b'])), 'two runs nothing joins').toBe(false)
  expect(placesClaim(place([]), place([])), 'a row in no cluster at all').toBe(false)
  expect(placesClaim(place(['cl:a', 'cl:b']), place(['cl:b'])), 'one shared cluster is enough').toBe(true)
})

// CLASS 3 IS SELECTED BY NUMBER, and an origin that already fits has nothing to renumber.
// Mutation: make `numbersOutsideRun` true for everything and every member is paired against every
// other, which is a cartesian product over a cluster rather than a repair.
test('a member is a candidate only when its numbering does not fit the run', () => {
  const fits = listed('kitsu:f', 1, weekly('2026-07-17', 8))
  expect(numbersOutsideRun(fits, 12)).toBe(false)
  expect(numbersOutsideRun(listed('cr:f', 13, weekly('2026-07-17', 8)), 12)).toBe(true)
  expect(numbersOutsideRun(listed('cr:g', 1, weekly('2026-07-17', 14)), 12), 'and a list past the end is one too').toBe(true)
  expect(numbersOutsideRun([], 12)).toBe(false)
})

// A CONSTANT OFFSET IS TWO DIFFERENT FACTS, and the candidate's own numbering is what tells them
// apart. A list that numbers this run from 1 and fits inside it cannot be renumbered by an offset
// that would carry one of its rows off the end: that offset is the two sources publishing on
// different schedules. A list that starts at 13, or one that numbers a segment of a longer run, can.
// Mutation: drop the `absorbed` clause and 8.4 goes red, because Fullmetal's season 2 numbers 1 to 13
// inside a run of 64 at a constant +13 and that IS a renumbering; drop `min === 1` and a list that
// starts at 2 stops being renumbered; drop `max > runLength` and the lend of 8.1 goes red; drop the
// one-offset test and a single disagreeing row carries the whole list; drop the empty-pairs return
// and the function throws on a candidate that paired with nothing.
test('a constant offset a candidate cannot absorb is a skew, and every other one is a renumbering', () => {
  const skewOf = (runLength: number, reference: SideEpisode[], theirs: SideEpisode[]) =>
    scheduleSkew({ runLength, episodes: theirs, pairs: pairsByDay(reference, theirs).pairs })

  // the bug: twelve rows numbered 1 to 12 against a run of 12, streamed six days before the broadcast
  const broadcast = listed('anizip:s', 1, weekly('2026-07-01', 12).map(anizipDay))
  expect(skewOf(12, broadcast, listed('cr:s', 1, weekly('2026-06-25', 12))), 'one late, and row 1 has nowhere to go').toBe(-1)

  // 8.2: Crunchyroll's 13 to 20 on the run's own days. The offset is -12 and it is a real renumbering
  const samurai = listed('anizip:t', 1, weekly('2026-07-17', 12).map(anizipDay))
  const elusive = listed('cr:t', 13, weekly('2026-07-17', 8))
  expect(skewOf(12, samurai, elusive), 'a list that starts at 13 is numbering something else').toBe(null)
  expect(decideCandidate({ runLength: 12, reference: samurai, candidate: { retranslates: false, episodes: elusive } }))
    .toMatchObject({ ok: true, rule: 'dates' })
  expect(pairsByDay(samurai, elusive).pairs.map(pair => [pair.fromNumber, pair.toNumber]),
    '8.2 still renumbers 13 to 20 onto 1 to 8')
    .toEqual(Array.from({ length: 8 }, (_, index) => [index + 13, index + 1]))

  // 8.4: Crunchyroll's season 2 numbers 1 to 13 inside a run of 64, at a constant +13. Every row it
  // renumbers lands on a row of that run, so the offset is absorbed and rule 1 is right
  const fma = listed('anizip:u', 1, weekly('2009-04-05', 64).map(anizipDay))
  expect(skewOf(64, fma, listed('cr:u', 1, weekly('2009-04-05', 13, 13))), 'rows 14 to 26 are rows of that run').toBe(null)

  // the mirror of the bug, to show the clause is about the offset and not about its sign: a stream
  // six days AHEAD of the broadcast pairs its 1 to 11 onto 2 to 12, and its own 12 has nowhere to go
  expect(skewOf(12, broadcast, listed('cr:v', 1, weekly('2026-07-07', 12))), 'one early').toBe(1)

  // a list that does not START at 1 has not claimed this run's numbering, so the dates decide even
  // when its offset is unabsorbable: 2 to 9 against a run of 12, pairing 3 to 9 onto 1 to 7 at -2.
  // This is 8.2's principle stated generally, and it is the whole of the `min === 1` clause, which
  // 8.2 itself never reaches because 13 to 20 is already past a run of 12
  expect(skewOf(12, broadcast, listed('cr:p', 2, weekly('2026-06-24', 8))), 'and 2 is not 1').toBe(null)

  // ONE ROW THAT DOES NOT SHARE THE OFFSET is enough: a list that is one late everywhere except in
  // one place is not a schedule, and rule 1 is then the per-episode evidence it always was
  const late = listed('cr:w', 1, weekly('2026-06-25', 12))
  const bent = pairsByDay(broadcast, late).pairs
  expect(scheduleSkew({ runLength: 12, episodes: late, pairs: bent }), 'the control: all of them at -1').toBe(-1)
  expect(scheduleSkew({
    runLength: 12,
    episodes: late,
    pairs: [...bent.slice(1), { ...bent[0]!, toNumber: bent[0]!.toNumber + 1 }],
  })).toBe(null)

  expect(skewOf(12, broadcast, listed('cr:x', 1, weekly('2026-07-01', 12))), 'an offset of zero is agreement').toBe(null)
  expect(scheduleSkew({ runLength: 12, episodes: late, pairs: [] }), 'and a candidate that paired with nothing').toBe(null)

  // CLASS 3 CAN NEVER REACH THIS GUARD: its entry test is `numbersOutsideRun`, which is the exact
  // negation of this guard's own numbering clause, so the two select disjoint sets of candidates
  for (const own of [elusive, listed('cr:y', 1, weekly('2026-07-17', 14)), listed('cr:z', 2, weekly('2026-07-17', 6))]) {
    expect(numbersOutsideRun(own, 12)).toBe(true)
    expect(skewOf(12, samurai, own)).toBe(null)
  }
})

// WHEN THE TWO RULES DISAGREE, the numbering decides which one was measuring the right thing. A
// candidate numbered 1 to 12 against a run of 12 is placed by its own numbering, so the dates are a
// skew and rule 2 answers; a candidate numbered 13 to 20 is not, so rule 1 answers and rule 2 never
// runs, which is the order 5.4 P4 states.
// Mutation: return the skew offset from `scheduleSkew` unconditionally and the second half flips to
// `titles` at 5 to 12, which is 8.2 renumbered by the wrong eight rows.
test('date evidence and title evidence that disagree are settled by the candidate\'s own numbering', () => {
  const days = weekly('2026-07-01', 12)
  const named = (uri: string, number: number, day: string | null, name: string): SideEpisode =>
    side(uri, number, day, [name])
  const reference = days.map((day, index) => named(`anizip:d-${index + 1}`, index + 1, anizipDay(day), `chapter ${index + 1}`))

  // the dates say N+1 to N and the titles say N to N: the titles are right, and the guard is what
  // lets them be heard at all
  const skewed = weekly('2026-06-25', 12).map((day, index) => named(`cr:d-${index + 1}`, index + 1, day, `chapter ${index + 1}`))
  expect(pairsByDay(reference, skewed).pairs.map(pair => [pair.fromNumber, pair.toNumber])
    .sort((a, b) => a[0]! - b[0]!), 'what rule 1 alone says')
    .toEqual(Array.from({ length: 11 }, (_, index) => [index + 2, index + 1]))
  const settled = decideCandidate({ runLength: 12, reference, candidate: { retranslates: false, episodes: skewed } })
  expect(settled.ok && settled.rule).toBe('titles')
  expect(settled.ok && settled.pairs.map(pair => [pair.fromNumber, pair.toNumber]).sort((a, b) => a[0]! - b[0]!))
    .toEqual(Array.from({ length: 12 }, (_, index) => [index + 1, index + 1]))

  // and the same disagreement on 8.2's numbering: rule 1 runs first and rule 2 is never consulted
  const renumbered = days.slice(0, 8).map((day, index) => named(`cr:e-${index + 13}`, index + 13, day, `chapter ${index + 5}`))
  const byDates = decideCandidate({ runLength: 12, reference, candidate: { retranslates: false, episodes: renumbered } })
  expect(byDates.ok && byDates.rule).toBe('dates')
  expect(byDates.ok && byDates.pairs.map(pair => [pair.fromNumber, pair.toNumber]))
    .toEqual(Array.from({ length: 8 }, (_, index) => [index + 13, index + 1]))
  expect(pairsByTitle(reference, renumbered).pairs.map(pair => [pair.fromNumber, pair.toNumber])[0], 'what rule 2 would have said')
    .toEqual([13, 5])
})

// A SKEW WITH NOTHING TO FALL BACK ON IS A WRITTEN REFUSAL, not a silence and not a guess.
// Mutation: return `no-dates` instead of `date-skew` and "why is this button missing" stops
// distinguishing a schedule that never met from one that met and was refused.
test('a skew whose titles cannot rescue it refuses date-skew', () => {
  const reference = listed('anizip:g', 1, weekly('2026-07-01', 12).map(anizipDay))
  const theirs = listed('cr:g', 1, weekly('2026-06-25', 12))
  expect(decideCandidate({ runLength: 12, reference, candidate: { retranslates: false, episodes: theirs } }))
    .toEqual({ ok: false, reason: 'date-skew' })
  // and a retranslating origin is still refused for the older reason, which is the more specific one
  expect(decideCandidate({ runLength: 12, reference, candidate: { retranslates: true, episodes: theirs } }))
    .toEqual({ ok: false, reason: 'retranslates' })
})

// ---------------------------------------------------------------------------------------------

// A REAL RECORDED PAGE, the only case here that meets shapes nobody chose. It REPORTS its numbers
// rather than asserting a threshold on them, because a figure pinned to one walk fails on the next
// walk rather than on the next bug. What is asserted is what must hold whatever the page contains:
// the invariants, no `SAME_AS` from this plugin, and every pair inside its run's window.
test('the 800 recorded rows pair, refuse and hold the invariants', async () => {
  if (!existsSync(CORPUS)) {
    console.warn(`no corpus at ${CORPUS}: run \`npm run corpus:walk\` to record one. This case did not run.`)
    return
  }
  const rows: AnswerRow[] = []
  for (const line of readFileSync(CORPUS, 'utf-8').split('\n')) {
    if (rows.length >= 800) break
    if (!line.trim()) continue
    rows.push(JSON.parse(line) as AnswerRow)
  }
  expect(rows.length, 'a recorded page is about 800 rows (2026-09-12)').toBeGreaterThan(100)

  // THE FIXTURES ARE ALREADY IN THIS GRAPH, so the totals below are the whole store and only the
  // DELTA is the page's. Reporting the total alone would credit the recorded page with 118 pairs the
  // cases above built by hand, which is the shape of a number that proves nothing
  const countOf = async (cypher: string) => Number((await rowsOf(cypher))[0]!.total)
  const PAIRS = "MATCH ()-[l:EPISODE_LINK]->() WHERE l.by = 'plugin:range' RETURN count(l) AS total"
  const ACTIVE_PAIRS =
    "MATCH ()-[l:EPISODE_LINK]->() WHERE l.by = 'plugin:range' AND l.status = 'active' RETURN count(l) AS total"
  const REFUSED_PAIRS =
    "MATCH ()-[l:EPISODE_LINK]->() WHERE l.by = 'plugin:range' AND l.status = 'refused' RETURN count(l) AS total"
  // what the pairs are FOR: the rows they place on a slot a member already fills (5.4 P5)
  const ALIGNED = "MATCH ()-[f:FILLS]->() WHERE f.via = 'aligned' RETURN count(f) AS total"
  const RANGES = "MATCH ()-[l:LINK]->() WHERE l.by = 'plugin:range' AND l.status = 'active' RETURN count(l) AS total"
  const REFUSED = "MATCH ()-[l:LINK]->() WHERE l.by = 'plugin:range' AND l.status = 'refused' RETURN count(l) AS total"
  const seeded = {
    pairs: await countOf(PAIRS), activePairs: await countOf(ACTIVE_PAIRS),
    refusedPairs: await countOf(REFUSED_PAIRS), alignedFills: await countOf(ALIGNED),
    ranges: await countOf(RANGES), refusals: await countOf(REFUSED),
  }

  const ingested = await replayAnswers(rows)
  expect(ingested.quarantined).toEqual([])

  const started = Date.now()
  const pass = await runPass()
  const passMs = Date.now() - started

  const { query } = await graphReady()
  expect((await checkInvariants(query)).counts).toEqual({
    'includes-inside': 0, 'part-of-inside': 0, 'cross-scope-link': 0, 'double-membership': 0,
  })

  const byRule = await rowsOf(
    `MATCH ()-[l:EPISODE_LINK]->() WHERE l.by = 'plugin:range'
     RETURN l.reason AS reason, l.status AS status, count(l) AS total ORDER BY reason, status`
  )
  const ranges = await rowsOf(
    `MATCH ()-[l:LINK]->() WHERE l.by = 'plugin:range' AND l.status = 'active'
     RETURN l.kind AS kind, count(l) AS total ORDER BY kind`
  )
  const refusals = await rowsOf(
    `MATCH ()-[l:LINK]->() WHERE l.by = 'plugin:range' AND l.status = 'refused'
     RETURN l.reason AS reason, count(l) AS total ORDER BY reason`
  )
  const [minted] = await rowsOf(
    "MATCH ()-[l:LINK]->() WHERE l.by = 'plugin:range' AND l.kind <> 'INCLUDES' RETURN count(l) AS total"
  )
  expect(Number(minted!.total), 'no media SAME_AS, on a page nobody chose either').toBe(0)

  // EVERY PAIR IS INSIDE ITS RUN'S WINDOW, which is the one property a recorded page can check that a
  // fixture cannot: it holds whatever the page contains, and a window applied to the wrong cluster
  // would show up here rather than in a case built to pass
  const outside = await rowsOf(
    `MATCH (a:Episode)-[l:EPISODE_LINK]->(b:Episode)<-[h:HAS_EPISODE]-(m:Media)-[:MEMBER_OF]->(c:Cluster)
     WHERE l.by = 'plugin:range' AND h.claimer = m.origin AND c.runLength IS NOT NULL
       AND (l.toNumber < 1 OR l.toNumber > c.runLength)
     RETURN a.uri AS fromUri, b.uri AS toUri, l.toNumber AS toNumber, c.runLength AS runLength`
  )
  expect(outside).toEqual([])

  console.info('plugin:range over 800 corpus rows:', JSON.stringify({
    pairsByRule: Object.fromEntries(byRule.map(row => [`${String(row.reason)} ${String(row.status)}`, Number(row.total)])),
    ranges: Object.fromEntries(ranges.map(row => [String(row.kind), Number(row.total)])),
    refusals: Object.fromEntries(refusals.map(row => [String(row.reason), Number(row.total)])),
    seeded,
    // which side proved which, since on a page with no `containing` answer yet (4.4) class 1 is
    // nearly empty and the transitional lend is what carries the pairs
    byOrigin: (await rowsOf(
      `MATCH (a:Episode)-[l:EPISODE_LINK]->(b:Episode) WHERE l.by = 'plugin:range'
       RETURN a.origin AS fromOrigin, b.origin AS toOrigin, count(l) AS total
       ORDER BY fromOrigin, toOrigin`
    )).map(row => `${row.fromOrigin} to ${row.toOrigin}: ${Number(row.total)}`),
    fromTheRecordedPage: {
      pairs: await countOf(PAIRS) - seeded.pairs,
      activePairs: await countOf(ACTIVE_PAIRS) - seeded.activePairs,
      refusedPairs: await countOf(REFUSED_PAIRS) - seeded.refusedPairs,
      alignedFills: await countOf(ALIGNED) - seeded.alignedFills,
      ranges: await countOf(RANGES) - seeded.ranges,
      refusals: await countOf(REFUSED) - seeded.refusals,
    },
    // what the plugin itself said it did, which is the only place a refused candidate with no `LINK`
    // to write on (a lend, a member) is counted at all
    // what the page GIVES the three classes, since a plugin that finds nothing and a page that
    // carries nothing look identical in a count of pairs
    material: {
      hasEpisode: await countOf('MATCH ()-[h:HAS_EPISODE]->() RETURN count(h) AS total'),
      // the lend measured WITHOUT the membership join, so a count of zero is a fact about what the
      // ingest wrote rather than about what the aggregate clustered
      lentAnywhere: await countOf(
        "MATCH (m:Media)-[h:HAS_EPISODE]->(:Episode) WHERE h.claimer <> m.origin RETURN count(h) AS total"
      ),
      lentOntoMembers: await countOf(
        `MATCH (c:Cluster)<-[:MEMBER_OF]-(m:Media)-[h:HAS_EPISODE]->(:Episode)
         WHERE c.scope = 'RUN' AND h.claimer <> m.origin RETURN count(h) AS total`
      ),
      episodeClaims: await countOf('MATCH ()-[c:EPISODE_CLAIMS]->() RETURN count(c) AS total'),
    },
    log: pass.logs.filter(event => event.rule === 'range').map(event => event.detail),
    iterations: pass.iterations,
    passMs,
    rangeMs: pass.runs.filter(run => run.id === 'plugin:range').map(run => run.ms),
  }, null, 2))

  const again = await runPass()
  expect(again.changes, 'the same page twice is the same view').toEqual([])
  console.info(`the second pass over the same graph: ${again.ms} ms, ${again.iterations} iteration(s), nothing written`)
}, 600_000)
