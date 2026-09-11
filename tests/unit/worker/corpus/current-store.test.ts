// The corpus, run against the store it was extracted from. Every case must pass here: the cases come
// from four suites that are green today, so a red case means the extraction is wrong.
//
// See tests/corpus/README.md for what the corpus is, where each case came from, and the mutation run
// that proves it can go red.
import { currentStore } from '../../../corpus/adapters/current-store'
import { runCorpus } from '../../../corpus/run'

runCorpus(currentStore)
