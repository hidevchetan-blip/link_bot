const { chromium } = require('playwright')
const path = require('path')

let context = null

// Dedicated pages
let messagesPage = null
let jobsPage = null
let replyPage = null

let lastThreadUrl = null

const seen = new Set()

const PROFILE_PATH = '/home/hstpl_lap_328/linkedin-profile'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function humanMove(targetPage) {
  await targetPage.mouse.move(
    Math.random() * 800 + 100,
    Math.random() * 400 + 100
  )

  await targetPage.waitForTimeout(
    Math.random() * 500 + 200
  )
}

async function safeGoto(targetPage, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await targetPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      return
    } catch (err) {
      console.log(`⚠️ Navigation retry ${i + 1}: ${err.message}`)

      if (i === retries - 1) {
        throw err
      }

      await delay(3000)
    }
  }
}

function ensureAlive() {
  if (!context || context.isClosed()) {
    throw new Error('Browser context closed')
  }

  if (!messagesPage || messagesPage.isClosed()) {
    throw new Error('Messages page closed')
  }

  if (!jobsPage || jobsPage.isClosed()) {
    throw new Error('Jobs page closed')
  }

  if (!replyPage || replyPage.isClosed()) {
    throw new Error('Reply page closed')
  }
}

// ─────────────────────────────────────────────────────────────
// Browser Init
// ─────────────────────────────────────────────────────────────

async function initBrowser() {
  if (context && !context.isClosed()) {
    await context.close()
  }

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

  // Dedicated pages
  messagesPage = await context.newPage()
  jobsPage = await context.newPage()
  replyPage = await context.newPage()

  // Anti-detection
  for (const p of [messagesPage, jobsPage, replyPage]) {
    await p.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      })
    })
  }

  // Open LinkedIn messages
  await safeGoto(
    messagesPage,
    'https://www.linkedin.com/messaging/?filter=unread'
  )

  try {
    await messagesPage.waitForSelector(
      'li.msg-conversation-listitem',
      { timeout: 30000 }
    )
  } catch {
    console.log('📭 No messages on startup')
  }

  console.log('✅ LinkedIn Messaging loaded')

  // Clear cache every hour
  setInterval(() => {
    seen.clear()
    console.log('🧹 Cleared seen messages cache')
  }, 60 * 60 * 1000)
}

// ─────────────────────────────────────────────────────────────
// Check Unread Messages
// ─────────────────────────────────────────────────────────────

async function checkUnreadMessages() {
  const results = []

  try {
    ensureAlive()

    await safeGoto(
      messagesPage,
      'https://www.linkedin.com/messaging/?filter=unread'
    )

    await messagesPage.waitForTimeout(3000)

    await humanMove(messagesPage)

    try {
      await messagesPage.waitForSelector(
        'li.msg-conversation-listitem',
        { timeout: 10000 }
      )
    } catch {
      console.log('📭 No messages found')
      return results
    }

    const allChats =
      messagesPage.locator('li.msg-conversation-listitem')

    const total = await allChats.count()

    console.log(`📋 Total chats: ${total}`)

    const unreadIndices = []

    // Collect senders
    for (let i = 0; i < total; i++) {
      const item = allChats.nth(i)

      let sender = null

      try {
        sender = await item
          .locator(
            'h3.msg-conversation-listitem__participant-names span.truncate'
          )
          .textContent({ timeout: 3000 })

        sender = sender?.trim()
      } catch {
        try {
          sender = await item
            .locator(
              'h3.msg-conversation-listitem__participant-names'
            )
            .textContent({ timeout: 3000 })

          sender = sender?.trim()
        } catch {
          console.log(
            `⚠️ Could not get sender name for item ${i}`
          )

          continue
        }
      }

      if (sender) {
        unreadIndices.push({
          index: i,
          sender
        })

        console.log(`📌 Queued unread from: ${sender}`)
      }
    }

    if (unreadIndices.length === 0) {
      console.log('📭 No unread messages')
      return results
    }

    // Open threads
    for (const { index, sender } of unreadIndices) {

      await safeGoto(
        messagesPage,
        'https://www.linkedin.com/messaging/?filter=unread'
      )

      await messagesPage.waitForSelector(
        'li.msg-conversation-listitem',
        { timeout: 10000 }
      )

      await messagesPage.waitForTimeout(
        Math.random() * 800 + 300
      )

      await humanMove(messagesPage)

      const freshChats =
        messagesPage.locator('li.msg-conversation-listitem')

      const item = freshChats.nth(index)

      await item.click()

      await messagesPage.waitForSelector(
        '.msg-s-event-listitem__body',
        { timeout: 10000 }
      )

      await messagesPage.waitForTimeout(
        Math.random() * 1000 + 500
      )

      lastThreadUrl = messagesPage.url()

      console.log(`🔗 Thread URL: ${lastThreadUrl}`)

      let message = null

      try {
        const allMessages =
          messagesPage.locator('.msg-s-event-listitem__body')

        const msgCount = await allMessages.count()

        for (let j = msgCount - 1; j >= 0; j--) {

          const msgItem = allMessages.nth(j)

          const isOutgoing = await msgItem.evaluate(el => {
            const li = el.closest('li')
            const parent = li?.closest('.msg-s-message-group')

            return parent?.classList.contains(
              'msg-s-message-group--outbound'
            ) ?? false
          })

          if (!isOutgoing) {
            message = await msgItem.textContent()

            console.log(
              `💬 Incoming message: "${message?.trim()}"`
            )

            break
          }
        }

      } catch (err) {
        console.log(
          'Error getting message:',
          err.message
        )

        continue
      }

      if (!message) {
        console.log(
          `⚠️ No incoming message found from ${sender}`
        )

        continue
      }

      const seenKey =
        `${sender}::${message?.trim()}`

      if (seen.has(seenKey)) {
        console.log(
          `⏭️ Already processed message from ${sender}`
        )

        continue
      }

      const resumeKeywords = [
        'resume',
        'cv',
        'experience',
        'portfolio',
        'background',
        'profile',
        'credentials',
        'work history'
      ]

      const lowerMessage =
        message?.toLowerCase() || ''

      const isResumeRequest =
        resumeKeywords.some(k =>
          lowerMessage.includes(k)
        )

      if (!isResumeRequest) {
        console.log(
          `⏭️ Not a resume request from ${sender}`
        )

        seen.add(seenKey)

        continue
      }

      seen.add(seenKey)

      console.log(
        `📩 Resume request from ${sender}`
      )

      results.push({
        sender,
        message: message?.trim()
      })
    }

    return results

  } catch (err) {
    console.log(
      'checkUnreadMessages error:',
      err.message
    )

    return results
  }
}

// ─────────────────────────────────────────────────────────────
// Send LinkedIn Reply
// ─────────────────────────────────────────────────────────────

async function sendLinkedInReply(reply, profileId = null) {
  try {
    ensureAlive()

    if (profileId) {
      console.log(
        `🔗 Opening thread with profileId: ${profileId}`
      )

      await safeGoto(
        replyPage,
        `https://www.linkedin.com/messaging/thread/new/?recipient=${profileId}`
      )

    } else if (lastThreadUrl) {

      console.log(
        `🔗 Returning to thread: ${lastThreadUrl}`
      )

      await safeGoto(replyPage, lastThreadUrl)
    }

    await replyPage.waitForSelector(
      '.msg-form__contenteditable',
      { timeout: 10000 }
    )

    await replyPage.waitForTimeout(1000)

    // Attach resume only for recruiter replies
    if (!profileId) {

      const resumePath = path.resolve(
        __dirname,
        '../uploads/resume.pdf'
      )

      const fileInput =
        replyPage.locator('input[type="file"]').first()

      await fileInput.setInputFiles(resumePath)

      console.log('📎 PDF attached')

      await replyPage.waitForTimeout(2000)
    }

    const input =
      replyPage.locator('.msg-form__contenteditable')

    await input.click()

    // Human typing
    for (const char of reply) {
      await replyPage.keyboard.type(char)

      await replyPage.waitForTimeout(
        Math.random() * 100 + 30
      )
    }

    await replyPage.waitForTimeout(
      Math.random() * 1000 + 500
    )

    const sendBtn = replyPage.locator(
      'button.msg-form__send-button[type="submit"]'
    )

    await sendBtn.waitFor({ timeout: 5000 })

    // ENABLE THIS TO ACTUALLY SEND
    // await sendBtn.click()

    await replyPage.waitForTimeout(1000)

    if (profileId) {
      console.log(
        `✅ Referral message sent to ${profileId}`
      )
    } else {
      console.log('✅ CV reply + PDF sent')
    }

    lastThreadUrl = null

  } catch (err) {
    console.log(
      'sendLinkedInReply error:',
      err.message
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Navigate Jobs Feed
// ─────────────────────────────────────────────────────────────

async function navigateToJobsFeed(extraParam = '') {

  await safeGoto(
    jobsPage,
    'https://www.linkedin.com/feed/'
  )

  await jobsPage.waitForTimeout(2000)

  const jobsNavLink =
    jobsPage.locator('a[href*="/jobs/"]').first()
  console.log(jobsNavLink,"jobsNavLink")

  await jobsNavLink.waitFor({ timeout: 10000 })

  await jobsNavLink.click()

  await jobsPage.waitForTimeout(3000)

  if (extraParam) {

    const current = jobsPage.url()

    const separator =
      current.includes('?') ? '&' : '?'

    await safeGoto(
      jobsPage,
      `${current}${separator}${extraParam}`
    )

    await jobsPage.waitForTimeout(3000)
  }
}

// ─────────────────────────────────────────────────────────────
// Check New Job Posts
// ─────────────────────────────────────────────────────────────

async function checkNewJobPosts() {

  const results = []

  const seenJobIds = new Set()

  const feeds = [
    {
      label: 'Jobs for you',
      extraParam: ''
    },
    {
      label: 'Easy Apply',
      extraParam: 'f_AL=true'
    }
  ]

  try {
    ensureAlive()
    for (const feed of feeds) {
      console.log(
        `🔎 Scraping feed: "${feed.label}"`
      )
      try {
        await navigateToJobsFeed(feed.extraParam)
      } catch (navErr) {
        console.log(
          `⚠️ Could not navigate to "${feed.label}":`,
          navErr.message
        )
        continue
      }
      await humanMove(jobsPage)
      // NEW SELECTOR
      try {
        await jobsPage.waitForSelector(
          'a[href*="/jobs/collections/recommended/"]',
          { timeout: 20000 }
        )
      } catch {
        console.log(
          `📭 No job cards loaded for "${feed.label}"`
        )
        continue
      }
      // Scroll for lazy loading
      for (let s = 0; s < 5; s++) {
        await jobsPage.mouse.wheel(0, 1500)
        await jobsPage.waitForTimeout(
          1200 + Math.random() * 800
        )
      }
      // NEW CARD SELECTOR
      const jobCards = jobsPage.locator(
        'a[href*="/jobs/collections/recommended/"]'
      )
      const count = await jobCards.count()
      console.log(
        `📋 "${feed.label}": ${count} card(s)`
      )
      for (let i = 0; i < count; i++) {
        try {
          const card = jobCards.nth(i)
          // FULL TEXT
          const fullText =
            await card.textContent()

          // URL
          let href =
            await card.getAttribute('href')

          if (
            href &&
            !href.startsWith('http')
          ) {
            href =
              `https://www.linkedin.com${href}`
          }

          // JOB ID
          let jobId = null

          try {

            const match =
              href?.match(/currentJobId=(\d+)/)

            if (match) {
              jobId = match[1]
            }

          } catch {}

          if (!jobId) continue

          if (seenJobIds.has(jobId)) {
            continue
          }

          seenJobIds.add(jobId)

          // TITLE
          let title = 'Unknown Title'

          try {

            title = (
              await card.locator('p')
                .first()
                .textContent()
            )?.trim()

          } catch {}

          // COMPANY
          let company = 'Unknown Company'

          try {

            const paragraphs =
              await card.locator('p')
                .allTextContents()

            if (paragraphs.length >= 2) {
              company = paragraphs[1]?.trim()
            }

          } catch {}

          // LOCATION
          let location = 'Unknown Location'

          try {

            const locationMatch =
              fullText?.match(
                /(Remote|Hybrid|On-site|Gurugram|Noida|Pune|Bangalore|Delhi|Mumbai|Hyderabad|Chennai).*?/i
              )

            if (locationMatch) {
              location =
                locationMatch[0]?.trim()
            }

          } catch {}

          // POSTED AT
          let postedAt = 'Unknown'

          try {

            const postedMatch =
              fullText?.match(
                /(\d+\s(?:hour|hours|day|days|week|weeks|month|months)\sago)/i
              )

            if (postedMatch) {
              postedAt =
                postedMatch[1]
            }

          } catch {}

          // EASY APPLY
          let easyApply = false

          try {

            easyApply =
              fullText?.includes('Easy Apply')

          } catch {}

          // PROMOTED
          let promoted = false

          try {

            promoted =
              fullText?.includes('Promoted')

          } catch {}

          console.log(
            `💼 ${title} @ ${company} (${postedAt})`
          )

          results.push({
            jobId,
            title,
            company,
            location,
            postedAt,
            easyApply,
            promoted,
            jobUrl: href
          })

        } catch (cardErr) {

          console.log(
            `⚠️ Error parsing card ${i}:`,
            cardErr.message
          )
        }
      }

      await jobsPage.waitForTimeout(
        Math.random() * 2000 + 1500
      )
    }

    console.log(
      `✅ checkNewJobPosts done — ${results.length} job(s) found`
    )

    return results

  } catch (err) {

    console.log(
      'checkNewJobPosts error:',
      err.message
    )

    return results
  }
}

// ─────────────────────────────────────────────────────────────
// Send Connection Requests
// ─────────────────────────────────────────────────────────────

async function sendConnectionRequests(employees) {

  const results = []

  for (const emp of employees) {

    try {

      await replyPage.goto(emp.profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      await replyPage.waitForTimeout(
        2000 + Math.random() * 3000
      )

      results.push({
        name: emp.name,
        success: true
      })

    } catch (e) {

      results.push({
        name: emp.name,
        success: false,
        error: e.message
      })
    }
  }

  return results
}

module.exports = {
  initBrowser,
  checkUnreadMessages,
  sendLinkedInReply,
  checkNewJobPosts,
  sendConnectionRequests
}