import { test, expect } from '@playwright/test'

test('Prisma UI component works correctly', async ({ page }) => {
  // Navigate to the main app
  await page.goto('http://localhost:4563/')
  
  // Wait for the component to load
  await page.waitForSelector('text=Prisma + wa-sqlite Browser Test', { timeout: 5000 })
  
  // Click Create Test Data
  await page.click('button:has-text("Create Test Data")')
  await page.waitForTimeout(1000)
  
  // Check that data was created
  const mediaSection = await page.locator('h3:has-text("Media")').textContent()
  expect(mediaSection).toContain('3 items')
  
  // Click Test Queries
  await page.click('button:has-text("Test Queries")')
  await page.waitForTimeout(2000)
  
  // Check status
  const status = await page.locator('text=Status:').locator('..').textContent()
  console.log('Status after queries:', status)
  
  // Check for error
  const errorElement = await page.locator('text=Error:').count()
  if (errorElement > 0) {
    const error = await page.locator('text=Error:').locator('..').textContent()
    console.log('Error found:', error)
    expect(error).not.toContain('incomplete input')
  }
  
  // Verify queries executed successfully
  expect(status).toContain('Queries executed successfully')
  
  // Check that related media results are displayed
  const relatedMediaSection = await page.locator('h3:has-text("Related Media Query Result")').count()
  expect(relatedMediaSection).toBeGreaterThan(0)
  
  console.log('✅ UI test passed!')
})