import { test } from '@playwright/test'

import tests from './_tests_'

type TestObject = {
  [key: string]: TestObject | (() => any)
}

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ path: './build/test.js', type: 'module' })
})

const recurseTests = (tests: TestObject, path: string[] = []) => {
  for (const [key, value] of Object.entries(tests)) {
    if (typeof value === 'function') {
      test(key, async ({ page }) => {
        await page.evaluate(async ([key, path]) => {
          await path.reduce((obj, key) => obj[key], globalThis.tests)[key]()
        }, [key, path] as const)
      })
    } else if (typeof value === 'object') {
      test.describe(key, () => {
        recurseTests(value, [...path, key])
      })
    }
  }
}
recurseTests(tests)
