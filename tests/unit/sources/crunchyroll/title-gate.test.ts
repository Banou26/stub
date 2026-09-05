import { describe, expect, test } from 'vitest'

import { bestTitleScore } from '../../../../src/sources/utils'

/**
 * The threshold the Crunchyroll search gate holds candidates to. Kept in step with
 * CONFIDENT_TITLE_THRESHOLD in ./extractor.ts, which is the value under test here.
 *
 * 0.9 is measured, not chosen. Over the cases below every correct pairing scores exactly 1.000, because
 * stripping season markers and taking the best of the cluster's titles makes a true match exact, while
 * the highest scoring WRONG pairing is 0.8135. The threshold sits in that 0.1865 gap, nearer the wrong
 * side so ordinary punctuation and romanization noise still clears it.
 *
 * The two that bind it, both the dangerous shape (a real title plus a suffix):
 *   0.8135  Mushoku Tensei: Jobless Reincarnation  vs  ... Gaiden   (spin-off)
 *   0.7685  Steins;Gate                            vs  Steins;Gate 0 (sequel)
 * Anything at or above 0.9 in this set is the same work under a different catalogue's name.
 *
 * Both numbers are frizbee's, re-measured 2026-08-29. They read 0.837 and 0.833 here until then, which
 * were seal-wasm's and had survived the engine swap unchanged: the gap they described was 0.163 rather
 * than the 0.1865 there actually is, so the margin was understated. The verdicts never moved.
 */
const THRESHOLD = 0.9

const accepts = async (knownTitles: string[], candidate: string) =>
  (await bestTitleScore(knownTitles, candidate)) >= THRESHOLD

// The titles a cluster actually carries, as AniList and MAL name them, against the title Crunchyroll
// lists. Every string here is a real catalogue name, because the gate's whole job is to survive the
// ways real catalogues disagree.
describe('crunchyroll search title gate', () => {
  describe('accepts the show it is actually looking at', () => {
    test('exact franchise name', async () => {
      expect(await accepts(
        ['Mushoku Tensei: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation'],
        'Mushoku Tensei: Jobless Reincarnation'
      )).toBe(true)
    })

    // the reason season markers come off both sides: our source names the season, the catalogue names
    // the series, and this is precisely the multi-season case the search path exists to rescue
    test('our title names a season, the catalogue names the series', async () => {
      expect(await accepts(
        ['Mushoku Tensei: Jobless Reincarnation Season 3'],
        'Mushoku Tensei: Jobless Reincarnation'
      )).toBe(true)
      expect(await accepts(
        ['Mushoku Tensei: Isekai Ittara Honki Dasu 2nd Season'],
        'Mushoku Tensei: Isekai Ittara Honki Dasu'
      )).toBe(true)
    })

    // catalogues disagree about the canonical name, so one of OUR titles matching is enough
    test('only the english title matches, and that is enough', async () => {
      expect(await accepts(
        ['Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba', '鬼滅の刃'],
        'Demon Slayer: Kimetsu no Yaiba'
      )).toBe(true)
    })

    test('only the romaji title matches, and that is enough', async () => {
      expect(await accepts(
        ['Shingeki no Kyojin', 'Attack on Titan'],
        'Shingeki no Kyojin'
      )).toBe(true)
    })

    test('punctuation and case differences do not matter', async () => {
      expect(await accepts(['Re:ZERO -Starting Life in Another World-'], 'Re:Zero Starting Life in Another World')).toBe(true)
      expect(await accepts(['KAGUYA-SAMA: LOVE IS WAR'], 'Kaguya-sama: Love Is War')).toBe(true)
    })

    test('a native-script title matches its own name', async () => {
      expect(await accepts(['葬送のフリーレン', 'Sousou no Frieren'], '葬送のフリーレン')).toBe(true)
    })
  })

  describe('refuses a different show', () => {
    // the case the whole gate exists for: one franchise name, two unrelated adaptations. Title cannot
    // separate these at ALL, which is why the date axis is not optional.
    test('shares a franchise name but is a different work: still needs the date axis', async () => {
      // identical after season stripping, so the title axis passes and ONLY the date can refuse it.
      // asserted here so the gate's dependence on the second axis is recorded, not assumed.
      expect(await accepts(['Fruits Basket'], 'Fruits Basket')).toBe(true)
    })

    test('a sequel-shaped but distinct title', async () => {
      expect(await accepts(['Gintama'], 'Gintama: The Very Final')).toBe(false)
      expect(await accepts(['Fate/Zero'], 'Fate/stay night [Unlimited Blade Works]')).toBe(false)
    })

    // the two highest scoring wrong answers in the whole sample, and the pair that pins the threshold.
    // A real title carrying a suffix is the shape most likely to slip through, so they are asserted by
    // name: if a future change lifts either of these over 0.9, the gate has stopped working.
    test('the closest wrong answers stay out: a real title plus a suffix', async () => {
      expect(await bestTitleScore(['Mushoku Tensei: Jobless Reincarnation'], 'Mushoku Tensei: Jobless Reincarnation Gaiden'))
        .toBeLessThan(THRESHOLD)
      expect(await bestTitleScore(['Steins;Gate'], 'Steins;Gate 0')).toBeLessThan(THRESHOLD)
    })

    test('shares a distinctive word but is a different show', async () => {
      expect(await accepts(['Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba'], 'Woochi: The Demon Slayer')).toBe(false)
      expect(await accepts(['Tokyo Ghoul'], 'Tokyo Revengers')).toBe(false)
      expect(await accepts(['Sword Art Online'], 'Sword Art Online Alternative: Gun Gale Online')).toBe(false)
    })

    test('a spin-off is not its parent', async () => {
      expect(await accepts(['Attack on Titan'], 'Attack on Titan: Junior High')).toBe(false)
      expect(await accepts(['Overlord'], 'Overlord: The Sacred Kingdom')).toBe(false)
    })

    test('unrelated shows never pass', async () => {
      expect(await accepts(['Sousou no Frieren', 'Frieren: Beyond Journey\'s End'], 'Bleach: Thousand-Year Blood War')).toBe(false)
      expect(await accepts(['One Piece'], 'One Punch Man')).toBe(false)
      expect(await accepts(['Jujutsu Kaisen'], 'Jigokuraku')).toBe(false)
    })

    test('nothing to compare against is a refusal, never a pass', async () => {
      expect(await accepts([], 'Mushoku Tensei')).toBe(false)
      expect(await accepts([''], 'Mushoku Tensei')).toBe(false)
      expect(await accepts(['Mushoku Tensei'], '')).toBe(false)
    })
  })
})
