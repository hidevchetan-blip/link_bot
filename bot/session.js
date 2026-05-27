const { chromium } = require('playwright')

async function login() {
  const context = await chromium.launchPersistentContext(
    '/home/hstpl_lap_328/linkedin-profile',
    {
      channel: 'chrome', // uses real Chrome, not Playwright's bundled Chromium
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled', // ← hides automation flag
      ],
      ignoreDefaultArgs: ['--enable-automation'], // ← removes automation banner
    }
  )

  const page = await context.newPage()
  
  // Mask playwright fingerprint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  await page.goto('https://www.linkedin.com/login')

  console.log('👉 Log in manually in the browser...')
  console.log('⏳ You have 120 seconds...')

  await page.waitForTimeout(120000)

  await context.close()
  console.log('✅ Session saved!')
}

login()