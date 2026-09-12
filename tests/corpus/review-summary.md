# Review queue triage

63 entries. 53 have a case file under `cases/` and 10 do not: those ten are the `repair:script`
drops, removed when stripping rows no source answered left them asserting nothing. Of the 53, 49 came
from `agent:opus:label` and 4 from `agent:opus:refute`; all 53 are `pending: new store` and all but
two are `checked.by: agent:opus:label+refute` (`mal-64394` and `mal-64623` also carry `+repair`). Nine
causes, and far fewer than 63 decisions: **43 of the 53 are one of four repeated shapes needing no per
case judgement**, 9 need a human, 5 only need confirming. Three slugs (`anilist-206521`,
`kitsu-50666`, `mal-64675`) are also in `known-disagreements.json`, so changing them changes that file.

**The one finding that is not a per case judgement.** The corpus is inconsistent about JustWatch
episode pairing. 16 of these cases pair JustWatch episodes to anizip or Crunchyroll on exact,
non generic titles with **no release date anywhere on the JustWatch side**; 8 refuse exactly that
evidence, five of them saying so in the `why` ("JustWatch is not a metadata catalogue"). Same source,
same evidence, opposite answer. One ruling closes group 4, or retracts pairs already asserted across
groups 1 and 2.

## Groups

### 1. A Netflix season row with no dates and placeholder or retranslated titles (16)

A `nf:<id>-<n>` row claims SAME_AS to every member, carries **no episode date at all**, titles its
entries `Episode N` after the first, and lists a count that is neither the run's nor the number aired.
It was left out of every expectation and flagged.

**Resolution: leave unasserted, no decision needed for 14 of the 16.** Nothing on the row can be
checked against anything, which is what the design's Ask log records. `anilist-190569` and
`anilist-177699` are the two where the count agrees, so they go to the human list instead.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-178789 | Mushoku Tensei: Jobless Reincarnation S3 | a date on any `nf:80987039-3` episode (12 against 14, and its claims are the container's) |
| anilist-103303 | Sparks of Tomorrow | a date or real title on `jw:320096-328355` or `nf:81698957-1` |
| anilist-187260 | I Want to Love You Till Your Dying Day | a date on any `nf:82964715-1` episode (10 against 13) |
| anilist-180136 | The Exiled Heavy Knight | a date on `nf:82942166-1` (11 against 26) |
| anilist-194219 | The Ogre's Bride | a date on `nf:82941666-1` (11 against 12, and 10 on cr and jw) |
| anilist-210031 | You and I Are Polar Opposites S2 | what `nf:82653227-2`'s `Episode 13` to `Episode 23` counts from |
| anilist-199748 | I Became a Legend After My 10 Year-Long Last Stand | a date on `nf:82941433-1` (11 against 12) |
| anilist-199111 | Grand Blue Dreaming S3 | a date on `nf:81169530-3`, which carries only the bare series title |
| anilist-185542 | Skeleton Knight in Another World S2 | a date on `nf:81597507-2`, bare series title, 10 against 12 |
| anilist-209669 | Hana-Kimi S2 | a date on `nf:82655955-2` (12 against 13) |
| anilist-196017 | Grow Up Show | a date on `nf:82941771-1` (11 against 13) |
| anilist-188525 | Draw This, Then Die! | whether "10 is the 10 aired of 12" counts as evidence |
| anilist-203490 | Please Excuse My Younger Brothers | a date on `nf:82941827-1` (11 against a 24 episode two cour run) |
| anilist-207254 | Thunder 3 | a date on `nf:82736186-1` (11 against mal's 12 and kitsu's 16) |
| anilist-190569 | Jaadugar: A Witch in Mongolia | **human**: count 12 and season title both agree, nothing else does |
| anilist-177699 | THE GHOST IN THE SHELL | **human**: count 10 of 10 agrees and entry 1 has a real title |

### 2. One episode position unpaired because the title is a romanization, a retranslation or a typo (9)

Everything else in the run pairs. One position (usually the last aired, usually JustWatch's) carries
the romanized Japanese where the others carry the English, or a reworded translation, and the
disagreeing source publishes no dates, so neither axis places it.

**Resolution: leave unpaired, no decision needed.** Confirm the rule once (a pair rests on a date or an
exact title, never on the position) and all nine close together.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-169583 | Oh Boy, Was I Wrong About Her | a date on `jw:10585538` (`Tomodachi, da yo ne` at position 10) |
| anilist-199408 | A Livid Lady's Guide to Getting Even | a date on `jw:10589509` (`Umibe nite` against `By the Sea`) |
| anilist-198409 | The World's Strongest Rearguard | a date on `jw:10880098` (`Kurueru Mori no Bijo`) |
| anilist-177637 | Goodbye, Lara | a date on `jw:10619385` (`Yaiba o Motta Princess`) |
| anilist-128757 | Young Ladies Don't Play Fighting Games | a date on `jw:10560934` (`Sou Omottan da`) |
| anilist-202269 | Love Unseen Beneath the Clear Night Sky | a date on `jw:10633349` (`Zutto, Soba ni`) |
| anilist-182616 | The Elusive Samurai S2 | a date on `kitsu:373724` (`Tokiyuki and the Three Generals` against `Three Great Generals`) |
| anilist-201514 | Rich Girl Caretaker | a title on `anizip:19690-1`, which is dated but untitled, against jw's `The Perfect Lady` |
| anilist-200637 | The 100 Girlfriends S3 | dates on the six reworded jw entries and on `kitsu:389558` (`Momji-chan's`, a typo) |

### 3. A Netflix title level container that could be the parent, the work, or neither (3)

A `nf:<id>` CONTAINER row claims SAME_AS to every member while carrying a different title, an older
start date and an episode list belonging to something else. Unlike the rows in group 6, the title is
close enough that a franchise page cannot be ruled out.

**Resolution: leave unasserted.** `anilist-201667` is the one worth a call, because a franchise page
plausibly does hold a spinoff season.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-201667 | Bungo Stray Dogs WAN! 2 | **human**: whether `nf:80132126`'s block of 12 generic entries is this short season |
| anilist-213750 | Bananya 10th Anniversary Special | whether `nf:81940044` (`The Party`, 2025, 3 episodes) is Netflix's name for this 1 episode special |
| mal-64779 | Seeing Double | whether `nf:81900131` (`The Double`, 2024, 40 placeholder episodes) is the parent title of this OVA |

### 4. A JustWatch season whose episodes carry the run's exact titles and no dates, left unpaired (6)

Membership is settled and asserted; only the per episode pairing is open. This is the inconsistent
group named above: 16 other cases in this queue pair on precisely this evidence.

**Resolution: one ruling, applied to all six and to the 16 that already pair.** Nothing here is a per
case judgement.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-135865 | Saga of Tanya the Evil S2 | the ruling; `jw:53433-304924` has the run's first ten titles exactly |
| anilist-187538 | BLACK TORCH | the ruling; `jw:472682-496533` repeats Crunchyroll's ten exactly |
| anilist-203880 | Dara-san of the Reiwa Era | the ruling; 11 exact titles, refused as "not a metadata catalogue" |
| anilist-208225 | The Duke's Son Claims He Won't Love Me | the ruling; 10 exact titles, refused for the same stated reason |
| anilist-196187 | Smoking Behind the Supermarket with You | the ruling, plus the 11 to 12 alignment of `nf:82757039-1`, which is already a member |
| anilist-196356 | My Stepmother and Stepsisters Aren't Wicked | different: jw is romaji against anizip's English, so no two strings match at all |

**The ruling, 2026-09-12 (the owner's, `pickSimilarSeason` rule 2 in `src/sources/similar.ts` and the
source matrix in `docs/design-inputs/03-source-capabilities.md`).** JustWatch's episode titles are
evidence, exact and non generic, three or more of them, the same way Crunchyroll's and TVmaze's are.
Only Netflix (`nf`) retranslates, and only its titles are refused for pairing. A JustWatch season row
listing the run's episodes under the run's own exact titles pairs episode by episode on those titles;
a placeholder such as `Episode 10` pairs with nothing; a `2026-01-01` start on a JustWatch row is a
missing date, never a disagreeing one. When the pairs cover the season the row is the run
(`together`) if its count does not exceed the run's, or holds it (`partOf`) if it does. This is the
reading the pilot case `anilist-178789` took.

Applied the same day to nine cases, 77 pairs in all, each one verified as the same string after
trimming and case folding: `anilist-135865` (10, against anizip), `anilist-187538` (10, cr),
`anilist-203880` (11, cr), `anilist-208225` (10, cr), `anilist-196187` (10, anizip),
`anilist-199111` (9, anizip), `anilist-185542` (7, cr), `anilist-177699` (5, anizip) and
`anilist-159309` (5, anizip). The counterpart is whichever side carries the identical string:
Crunchyroll where anizip writes an apostrophe as a backtick, anizip otherwise. `anilist-196356` is
unchanged at 0 pairs, since romaji against English is not an exact title.

Nothing needed a membership change: every JustWatch row above was already `together` with its run and
none of their counts exceeds the run's. What the titles do not support is left unasserted, which is
why nine JustWatch positions stay unpaired: two placeholders (`anilist-196187` 11 and 12), a
different translation (`anilist-199111` 1, `anilist-185542` 10), a typo (`anilist-185542` 2, Elvish
Blade against Elvish Bride), five joined segments using a plus where anizip uses a slash
(`anilist-177699` 1, 2, 3, 8, 10) and, in `anilist-159309` and `anilist-185542`, positions whose only
difference from the run's own string is the apostrophe character or the length of an ellipsis.

Review entries cleared: `anilist-135865`, `anilist-187538`, `anilist-203880`, `anilist-208225` and
`anilist-196356`, each of which raised the pairing and nothing else. `anilist-196187`,
`anilist-199111`, `anilist-177699`, `anilist-185542` and `anilist-159309` stay queued: their entries
also ask whether a Netflix row is this run (`nf:82757039-1`, `nf:81169530-3`, `nf:82942010-1`,
`nf:81597507-2`) or whether `nf:81716837` is a different work, and the ruling settles none of that.
`anilist-185542` was not on the list of eight; it was found by scanning the cases for a JustWatch
season whose exact titles were refused, and it is the same shape as the rest.

### 5. A JustWatch page that matches on title and count but whose only date is the `2026-01-01` placeholder (5)

A single row, often a film, whose title is exact and whose count agrees, but whose start date is
JustWatch's year level placeholder and whose episode carries no date.

**Resolution: leave unasserted, no decision needed.** JustWatch's `2026-01-01` is never a broadcast
date anywhere in this corpus, so it can never agree with anything; reading it as a missing field
rather than a disagreeing one would close all five at once.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-185874 | BLEACH: Thousand-Year Blood War, The Calamity | `jw:2866968` has one placeholder episode against a 10 episode cour |
| mal-64536 | To Your Island | a real date on `jw:2926665` against the run's 2026-08-07 |
| kitsu-50666 | Avatar Aang: The Last Airbender | a real date on `jw:1282106`; its SAME_AS chain also produced a 1989 Indiana Jones row |
| mal-64675 | Three Kingdoms: The Beginning | a real date on `jw:2867567`; its url slug names part 1 and Luoyang, which fits |
| kitsu-50829 | Dragon Striker | a real date on `jw:358381-366295`; count 11 agrees, nothing else exists on either side |

### 6. An `unrelated` mark that overrules the source's own SAME_AS, flagged for a second reader (2)

**Resolution: confirm, do not judge.** Both are correct on the evidence in the file. See section 4
below.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-159309 | Trapped in a Dating Sim S2 | `nf:81716837` is `Trapped Lemming`, 2021, matching no title in English, romaji or Japanese |
| mal-64623 | Shooting Star | `nf:81781638` is `Ties of Shooting Stars`, 2008, 10 episodes about grifting siblings |

### 7. Rows inside the run's own address that disagree with each other (6)

The clustering is not in question: these are ids that map to each other first party. What disagrees is
a count, a date, or in one case the title itself.

**Resolution: leave the first three alone** (a member's count is not a clustering claim and the corpus
asserts nothing about it). Three need a call and are in the human list.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-208044 | From Overshadowed to Overpowered | whether Crunchyroll's 2026-06-25 dates are an early stream of anizip's 2026-07-01 episodes |
| anilist-168134 | Hua Xianzi: Mofa Xiang Dui Lun | what `kitsu:47862`'s 46 undated, untitled episodes cover against 26 everywhere else |
| anilist-185875 | Nanoha EXCEEDS Gun Blaze Vengeance | the anizip `Final Episode Pre-Broadcast Special` has no episode row in the case, so nothing can be said |
| anilist-178972 | Grotesqqque | **human**: 2026-07-25 or 2026-11-06, and one film or three parts |
| mal-64394 | Big Brother Final Season | **human**: `anizip:20153`'s 26 is the whole run or the first cour of kitsu's 52 |
| anilist-213831 | Snack Hazama | **human**: `anilist:213831` and `mal:64543` are two different titles and two start dates |

### 8. One JustWatch season claiming two different MyAnimeList ids (2)

`jw:531130-580247` claims SAME_AS to `mal:64683` **and** `mal:63225` at once, and `offline:mal-63225`
claims SAME_AS to `anilist:205068` while AniList maps that run to `mal:64683`. The same conflict is
flagged from both sides.

**Resolution: one decision closes both entries.** Which MyAnimeList id is One-Room TA's.

| slug | title | what would settle it |
| --- | --- | --- |
| mal-64683 | One-Room TA | which of `mal:64683` and `mal:63225` the JustWatch season means |
| anilist-205068 | One-Room TA | the same question, reached from the AniList side |

### 9. The refuter removed a mark (4)

**Resolution: three are right and only need confirming; one has a live open question.** See sections 3
and 4.

| slug | title | what would settle it |
| --- | --- | --- |
| anilist-207141 | Chainsmoker Cat | confirm: `jw:518630-563252` rested on its own SAME_AS alone |
| anilist-200230 | Let's go KAIKIGUMI | confirm: `jw:532446-578025` likewise, and `nf:82074316` makes the same claim while being another show |
| anilist-197715 | The Villager of Level 999 | **human**: Crunchyroll lists one title at both position 10 and position 12 |
| anilist-206521 | The World Is Dancing | **human**: 11 romanized titles correspond in order, which is a reading and not a field |

### 10. Dropped, no case file (10)

All `repair:script`, all with the same reason: after removing rows no source answered, the case
asserted nothing, so it was dropped rather than left green while testing nothing.

**Resolution: nothing to decide.** Confirm the ten come back only with a walk where their catalogue
sources answer.

| slug | title |
| --- | --- |
| mal-64688 | I-Bull |
| mal-64721 | Rasen |
| mal-64753 | The Evil Sword GALDVAZAAG |
| mal-64757 | 2002 |
| mal-64762 | Re,bloom* |
| mal-64786 | Kyapi |
| mal-64803 | Kagami yo Kagami |
| mal-64805 | Umm |
| mal-64806 | Sanzen Nenshou |
| mal-64896 | Gum & Drop |

## The entries that genuinely need a human (9 decisions, 11 slugs)

1. **The JustWatch pairing rule** (`anilist-135865`, `-187538`, `-203880`, `-208225`, `-196187`,
   `-199111`, `-177699`, `-159309` against the 16 that already pair): exact non generic titles in
   order with no date are enough to pair an episode, or they are not and 16 cases lose their pairs.
2. **A count that agrees, and nothing else** (`anilist-190569`, `anilist-177699`): a matching episode
   count plus a matching season title is weak agreement on two fields, or a count places nothing and a
   Netflix season title is Netflix's own wording.
3. **A row's own SAME_AS, checked by nothing** (`anilist-207141`, `anilist-200230`): a first party
   identity claim is evidence in itself, or a claim no other field corroborates carries no row, which
   is what the refuter applied and what group 1 assumes.
4. **`anilist-213831`, Snack Hazama**: one work whose catalogues disagree on the title and premiere
   (SAME_AS handle plus a shared count of 12), or two works welded by a bad id mapping (no title and no
   date agrees).
5. **`anilist-178972`, Grotesqqque**: one film released 2026-11-06 as AniList and anizip have it, or
   three parts released 2026-07-25 as mal and kitsu have it.
6. **`mal-64394`, Big Brother Final Season**: `anizip:20153` is the whole run and kitsu's 52 is wrong,
   or it is the first 26 of a still releasing 52 and is a part rather than the run.
7. **`anilist-197715`, position 10**: Crunchyroll's `Damned Ideas of Common Sense` belongs at its
   position 10 and its dates are shifted, or it belongs at position 12 and the string is duplicated
   upward.
8. **`anilist-206521`**: 11 romanized JustWatch titles corresponding in order to 11 aired anizip
   episodes is agreement, or it is an inference over rows whose title, count and date agree on nothing.
9. **`anilist-201667`, Bungo Stray Dogs**: the Netflix franchise page holds the Wan! spinoff too, or it
   covers only the main series and should be neither attached nor merged.

## Where the labeller was wrong, or the refuter was right (confirm, do not judge)

- **`anilist-159309`**: `nf:81716837` is titled `Trapped Lemming` with a 2021 start and matches none of
  the run's titles. The `unrelated` mark stands. The second half of the flag, kitsu's 42 episodes
  against 12, is a kitsu data artifact inside an address already settled and is not a clustering
  question at all.
- **`mal-64623`**: `nf:81781638` is `Ties of Shooting Stars`, a 2008 ten episode drama, against a one
  episode 2026 music video. The `unrelated` mark stands; only the word `Shooting` is shared.
- **`anilist-207141` and `anilist-200230`**: both removals are right on the corpus's own rule. In
  `anilist-200230` the file supplies its own control: `nf:82074316` makes an identically shaped SAME_AS
  claim to four members while being `Let's Go Karaoke!`, so that claim shape demonstrably carries
  nothing.
- **`anilist-197715`**: the refuter is right that a title naming two rows on one side places neither,
  and that the only date it matches is anizip position 9. Only which position owns the title is open.
- **`kitsu-50666`**: no judgement is needed on the SAME_AS chain. It produced `nf:60010487`, Indiana
  Jones and the Last Crusade from 1989, so the chain is unreliable here as a matter of record and the
  JustWatch row cannot lean on it.
- **`mal-64683` and `anilist-205068`** are the same conflict filed twice, from either side. One answer
  closes two queue entries.
- **`anilist-185875` and `anilist-187260`** both flag an anizip pre broadcast special that the case
  file carries no episode row for. That is a gap in the walk, not a decision: a case cannot assert
  anything about a row it does not hold.
