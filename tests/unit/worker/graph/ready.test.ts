/**
 * The cold read: a reader that arrives before the boot has created the schema.
 *
 * Its own file because the engine cannot be closed and reopened inside one process, so "cold" is a
 * property of a fresh module registry and nothing else in here may open the graph first. Found on
 * 2026-09-12 by the browser arm of `scripts/check-graph-engine.mjs`: the page read the answer log
 * 300 ms into a 470 ms boot and got `Binder exception: Table Answer does not exist`, because
 * `openGraph()` resolves as soon as the connection is up, several awaits before the DDL has run.
 */
import { afterAll, expect, test } from 'vitest'

import { closeGraph, setGraphEnabled } from '../../../../src/worker/graph/engine'
import { exportAnswers } from '../../../../src/worker/graph/answers'

afterAll(async () => {
  await closeGraph()
})

test('exporting the log before anything booted the graph answers, rather than throwing', async () => {
  // the flag arrives over osra and the boot it starts is NOT awaited by the page, which is exactly
  // the window the browser arm read in
  setGraphEnabled(true)

  await expect(exportAnswers()).resolves.toEqual([])
})
