const { chromium } = require('playwright')

let page = null
let context = null
let lastThreadUrl = null
const seen = new Set()

const PROFILE_PATH = '/home/hstpl_lap_328/linkedin-profile'

async function initBrowser() {
  if (context && !context.isClosed()) await context.close()

  context = await chromium.launchPersistentContext(PROFILE_PATH, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  })

  const pages = context.pages()
  page = pages.length ? pages[0] : await context.newPage()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  await page.goto('https://www.linkedin.com/messaging/?filter=unread', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })

  try {
    await page.waitForSelector('li.msg-conversation-listitem', { timeout: 30000 })
  } catch {
    console.log('📭 No messages on startup')
  }

  console.log('✅ LinkedIn Messaging loaded')

  setInterval(() => {
    seen.clear()
    console.log('🧹 Cleared seen messages cache')
  }, 60 * 60 * 1000)
}

function ensureAlive() {
  if (!context || context.isClosed()) throw new Error('Browser context closed')
  if (!page || page.isClosed()) throw new Error('Page closed')
}

async function humanMove() {
  await page.mouse.move(
    Math.random() * 800 + 100,
    Math.random() * 400 + 100
  )
  await page.waitForTimeout(Math.random() * 500 + 200)
}

async function checkUnreadMessages() {
  const results = []
  try {
    ensureAlive()

    // 1. Navigate to unread filter
    await page.goto('https://www.linkedin.com/messaging/?filter=unread', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })

    await page.waitForTimeout(3000)
    await humanMove()

    try {
      await page.waitForSelector('li.msg-conversation-listitem', { timeout: 10000 })
    } catch {
      console.log('📭 No messages found')
      return results
    }

    const allChats = page.locator('li.msg-conversation-listitem')
    const total = await allChats.count()
    console.log(`📋 Total chats: ${total}`)

    // 2. FIRST PASS: collect all senders from unread filter page
    const unreadIndices = []
    for (let i = 0; i < total; i++) {
      const item = allChats.nth(i)
      let sender = null
      try {
        sender = await item
          .locator('h3.msg-conversation-listitem__participant-names span.truncate')
          .textContent({ timeout: 3000 })
        sender = sender?.trim()
      } catch {
        try {
          sender = await item
            .locator('h3.msg-conversation-listitem__participant-names')
            .textContent({ timeout: 3000 })
          sender = sender?.trim()
        } catch {
          console.log(`⚠️ Could not get sender name for item ${i}, skipping`)
          continue
        }
      }

      if (sender) {
        console.log(`📌 Queued unread from: ${sender}`)
        unreadIndices.push({ index: i, sender })
      }
    }

    if (unreadIndices.length === 0) {
      console.log('📭 No unread messages')
      return results
    }

    // 3. SECOND PASS: click each thread, read message, push to results
    for (const { index, sender } of unreadIndices) {
      // Reload unread list before each click so DOM is fresh
      await page.goto('https://www.linkedin.com/messaging/?filter=unread', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })
      await page.waitForSelector('li.msg-conversation-listitem', { timeout: 10000 })
      await page.waitForTimeout(Math.random() * 800 + 300)
      await humanMove()

      const freshChats = page.locator('li.msg-conversation-listitem')
      const item = freshChats.nth(index)

      await item.click()
      await page.waitForSelector('.msg-s-event-listitem__body', { timeout: 10000 })
      await page.waitForTimeout(Math.random() * 1000 + 500)

      lastThreadUrl = page.url()
      console.log(`🔗 Thread URL: ${lastThreadUrl}`)

      // Get last incoming message
      let message = null
      try {
        const allMessages = page.locator('.msg-s-event-listitem__body')
        const msgCount = await allMessages.count()

        for (let j = msgCount - 1; j >= 0; j--) {
          const msgItem = allMessages.nth(j)
          const isOutgoing = await msgItem.evaluate(el => {
            const li = el.closest('li')
            const parent = li?.closest('.msg-s-message-group')
            return parent?.classList.contains('msg-s-message-group--outbound') ?? false
          })
          if (!isOutgoing) {
            message = await msgItem.textContent()
            console.log(`💬 Incoming message: "${message?.trim()}"`)
            break
          }
        }
      } catch (err) {
        console.log('Error getting message:', err.message)
        continue
      }

      if (!message) {
        console.log(`⚠️ No incoming message found from ${sender}`)
        continue
      }

      const seenKey = `${sender}::${message?.trim()}`
      if (seen.has(seenKey)) {
        console.log(`⏭️ Already processed message from ${sender}`)
        continue
      }

      const resumeKeywords = [
        'resume', 'cv', 'portfolio', 'experience',
        'background', 'profile', 'work history', 'credentials'
      ]
      const lowerMessage = message?.toLowerCase() || ''
      const isResumeRequest = resumeKeywords.some(k => lowerMessage.includes(k))

      if (!isResumeRequest) {
        console.log(`⏭️ Not a resume request from ${sender}: "${message?.trim()}"`)
        seen.add(seenKey)
        continue
      }

      seen.add(seenKey)
      console.log(`📩 Resume request from ${sender}: "${message?.trim()}"`)
      results.push({ sender, message: message?.trim() })
    }

    return results

  } catch (err) {
    console.log('checkUnreadMessages error:', err.message)
    return results
  }
}

async function sendLinkedInReply(reply) {
  try {
    ensureAlive()

    if (lastThreadUrl) {
      await page.goto(lastThreadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })
      await page.waitForSelector('.msg-form__contenteditable', { timeout: 10000 })
      await page.waitForTimeout(1000)
    }

    const input = page.locator('.msg-form__contenteditable')
    await input.click()

    for (const char of reply) {
      await page.keyboard.type(char)
      await page.waitForTimeout(Math.random() * 100 + 30)
    }

    await page.waitForTimeout(Math.random() * 1000 + 500)

    // ✅ Exact Send button — type="submit", not the toggle
    const sendBtn = page.locator('button.msg-form__send-button[type="submit"]')
    await sendBtn.waitFor({ timeout: 5000 })
    await sendBtn.click()

    await page.waitForTimeout(1000)
    console.log('✅ Reply sent')
    lastThreadUrl = null

  } catch (err) {
    console.log('sendLinkedInReply error:', err.message)
  }
}
module.exports = { initBrowser, checkUnreadMessages, sendLinkedInReply }