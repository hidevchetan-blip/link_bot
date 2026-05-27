const { chromium } = require('playwright')

let page

async function initBrowser() {

  const browser = await chromium.launch({
    headless: false,
  })

  const context = await browser.newContext({
    storageState: 'linkedin-session.json',
  })

  page = await context.newPage()

  await page.goto('https://www.linkedin.com/messaging/')

  console.log('LinkedIn opened')
}

async function checkUnreadMessages() {

  await page.reload()

  await page.waitForTimeout(3000)

  const unreadChats = await page.locator('.msg-conversation-listitem--unread')

  const count = await unreadChats.count()

  if (count === 0) {
    return null
  }

  const firstChat = unreadChats.first()

  await firstChat.click()

  await page.waitForTimeout(2000)

  const sender = await page.locator('.msg-thread__link-to-profile').first().innerText()

  const message = await page.locator('.msg-s-event-listitem__body').last().innerText()

  return {
    sender,
    message,
  }
}

async function sendLinkedInReply(reply) {

  const input = page.locator('.msg-form__contenteditable')

  await input.click()

  await page.keyboard.type(reply, {
    delay: 50,
  })

  await page.waitForTimeout(1000)

  await page.setInputFiles(
    'input[type="file"]',
    './uploads/resume.pdf'
  )

  await page.waitForTimeout(3000)

  await page.keyboard.press('Enter')

  console.log('Reply sent')
}

module.exports = {
  initBrowser,
  checkUnreadMessages,
  sendLinkedInReply,
}