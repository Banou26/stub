// The corpus, run against the store it was extracted from. The 36 cases lifted off the old suites must
// pass here. The season cases labelled by hand (agents, refuted, reviewed) are the truth about the
// works, and where today's store disagrees with them the disagreement is listed in
// tests/corpus/known-disagreements.json and asserted to persist, so nothing about this store's
// behaviour changes silently while it is being replaced.
//
// See tests/corpus/README.md for what the corpus is, where each case came from, and the mutation run
// that proves it can go red.
import { currentStore } from '../../../corpus/adapters/current-store'
import { runCorpus } from '../../../corpus/run'
import knownDisagreements from '../../../corpus/known-disagreements.json'

runCorpus(currentStore, { known: knownDisagreements.cases })
