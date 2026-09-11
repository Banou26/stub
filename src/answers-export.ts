// The answer log reaches a page ONLY through `?export=answers`, and only as a window function, for
// the same reason the store export does (see ./store-export.ts): a query field would be permanent
// product surface, and a flagged window function exists only on a page that asked for it. Its
// ABSENCE is what tells a caller the flag never reached the app, which otherwise looks exactly like
// a session that answered nothing.
//
// The log fills behind `?graph=1` and nothing else, so a page carrying this flag alone installs a
// function that THROWS rather than one that answers an empty list: a log that is off and a log that
// is empty are different facts about a session.
import { readAnswersExportFlag } from './utils/export-flag'
import { exportAnswers } from './worker'

declare global {
  interface Window {
    __stubExportAnswers?: () => Promise<unknown>
  }
}

if (readAnswersExportFlag(location.href)) {
  window.__stubExportAnswers = () => exportAnswers()
}
