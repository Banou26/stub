// The answer log reaches a page ONLY through `?export=answers`, and only as a window function, for
// the same reason the store export does (see ./store-export.ts): a query field would be permanent
// product surface, and a flagged window function exists only on a page that asked for it. Its
// ABSENCE is what tells a caller the flag never reached the app, which otherwise looks exactly like
// a session that answered nothing.
//
// The log fills behind `?graph=1` and nothing else, so a page carrying this flag alone installs a
// function that THROWS rather than one that answers an empty list: a log that is off and a log that
// is empty are different facts about a session.
//
// `__stubGraphCounts` rides the same flag and the same rule. It is the other half of one question:
// the log says what the sources answered, the counts say what the ingest made of it, and a walk that
// reads only the first cannot tell a working tee from one that quarantined every row.
//
// `__stubExportAsks` rides it too, and is the third: the `Ask` log says which questions the app's own
// consumer put through `similarMedia` and what each came to, which is the only record of a source
// that answered nothing at all (7.3).
import { readAnswersExportFlag } from './utils/export-flag'
import { exportAnswers, exportAsks, graphCounts } from './worker'

declare global {
  interface Window {
    __stubExportAnswers?: () => Promise<unknown>
    __stubExportAsks?: () => Promise<unknown>
    __stubGraphCounts?: () => Promise<unknown>
  }
}

if (readAnswersExportFlag(location.href)) {
  window.__stubExportAnswers = () => exportAnswers()
  window.__stubExportAsks = () => exportAsks()
  window.__stubGraphCounts = () => graphCounts()
}
