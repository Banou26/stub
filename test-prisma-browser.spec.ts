import { test, expect } from '@playwright/test'

test('Prisma works in browser with wa-sqlite', async ({ page }) => {
  // Navigate to the verification page
  await page.goto('http://localhost:4560/verify-prisma.html')
  
  // Wait for the test to complete
  await page.waitForTimeout(5000)
  
  // Check the status
  const status = await page.locator('#status').textContent()
  console.log('Status:', status)
  
  // Get the output
  const output = await page.locator('#output').textContent()
  console.log('Output:', output)
  
  // Verify success
  expect(status).toContain('All tests passed')
  expect(output).toContain('SUCCESS')
  expect(output).toContain('Prisma is working with wa-sqlite')
})