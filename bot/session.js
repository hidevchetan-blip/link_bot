const { chromium } = require('playwright')

async function saveSession() {

  const browser = await chromium.launch({
    headless: false,
  })

  const context = await browser.newContext()

  const page = await context.newPage()

  await page.goto('https://www.linkedin.com/login')

  console.log('Login manually within 60 seconds')

  await page.waitForTimeout(60000)

  await context.storageState({
    path: 'linkedin-session.json',
  })

  console.log('Session saved')

  await browser.close()
}

saveSession()