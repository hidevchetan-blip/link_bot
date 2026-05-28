const { generateReply, generateReferralMessage } = require("./ai/openai")
const { initBrowser, sendLinkedInReply, checkUnreadMessages, checkNewJobPosts, checkNewAcceptances } = require("./bot/linkedin")
const { listenApproval, sendApprovalRequest, sendJobNotification, sendReferralApprovalRequest } = require("./telegram/telegram")
const { getPostedDays, buildPeopleUrl } = require("./utility/utility")

// ─── State ───────────────────────────────────────────────────────────────────
const pendingApprovals = new Map()       // keyed by sender — CV replies
const pendingReferrals = new Map()       // keyed by sender — referral messages
const seenJobIds = new Set()
const seenAcceptances = new Set()        // track processed acceptances
const MAX_DAYS = 30
// ─── Helpers ─────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Random delay between message checks (45s–75s)
 * Mimics human browsing pace
 */
function randomMessageDelay() {
  const ms = Math.floor(Math.random() * 30000) + 45000
  console.log(`⏳ Next message check in ${(ms / 1000).toFixed(1)}s`)
  return delay(ms)
}

/**
 * Time-aware random delay for job checks.
 * - Work hours (9am–6pm): every 3–7 mins  → fast enough to be first applicant
 * - Off hours:            every 10–15 mins → slow down, fewer jobs posted anyway
 */
function randomJobCheckDelay() {
  const hour = new Date().getHours()
  let minMs, maxMs

  if (hour >= 9 && hour <= 18) {
    minMs = 3 * 60 * 1000   // 3 mins
    maxMs = 7 * 60 * 1000   // 7 mins
  } else {
    minMs = 10 * 60 * 1000  // 10 mins
    maxMs = 15 * 60 * 1000  // 15 mins
  }

  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs
  console.log(`⏳ Next job check in ${(ms / 1000 / 60).toFixed(1)} mins`)
  return delay(ms)
}

/**
 * Human-like delay before sending referral message after acceptance.
 * Real humans don't message within seconds — they notice later.
 * Random 10–45 mins so it never looks like an instant bot response.
 */
function randomAcceptanceDelay() {
  const min = 10 * 60 * 1000   // 10 mins
  const max = 45 * 60 * 1000   // 45 mins
  const ms = Math.floor(Math.random() * (max - min)) + min
  console.log(`⏳ Waiting ${(ms / 1000 / 60).toFixed(1)} mins before referral approval request`)
  return delay(ms)
}

// ─── Job Monitor ─────────────────────────────────────────────────────────────

/**
 * Handles a newly detected job post:
 * Sends Telegram notification with:
 *   - Direct job link       → tap to apply immediately from iPhone
 *   - Company people link   → tap to browse employees, send manual connection requests
 */
async function handleNewJobPost(job) {
  const { jobId, title, company, companyUrl, postedAt, jobUrl } = job

  if (!jobId) return

  if (seenJobIds.has(jobId)) {
    console.log(`⏭️ Already processed: ${title}`)
    return
  }

  console.log(`🆕 Processing: "${title}" at ${company}`)

  const peopleUrl = buildPeopleUrl(companyUrl)

  try {
    await sendJobNotification({
      title,
      company,
      postedAt,
      jobUrl,
      companyUrl,
      peopleUrl
    })

    // mark ONLY after success
    seenJobIds.add(jobId)

    console.log(`📣 Telegram sent: ${title}`)

  } catch (e) {
    console.log(`Telegram notification error:`, e.message)
  }
}

async function startJobMonitor() {
  console.log("🔭 Job monitor started")

  while (true) {
    try {
      console.log("🔎 Checking for new job posts...")

      const jobs = await checkNewJobPosts()

      if (!jobs || jobs.length === 0) {
        console.log("📭 No job posts returned")
        await randomJobCheckDelay()
        continue
      }

      const newJobs = jobs.filter(job => {
        if (!job.jobId) return false
      
        if (seenJobIds.has(job.jobId)) return false
      
        const days = getPostedDays(job.postedAt)
      
        if (days > MAX_DAYS) {
          console.log(`⏭️ Skipping old job (${days} days): ${job.title}`)
          return false
        }
      
        return true
      })

      if (newJobs.length === 0) {
        console.log("📭 No new job posts")
      } else {
        console.log(`💼 ${newJobs.length} new job post(s) found`)

        for (const job of newJobs) {
          await handleNewJobPost(job)
          await delay(3000)
        }
      }

    } catch (e) {
      console.log("Job monitor error:", e.message)
    }

    await randomJobCheckDelay()
  }
}
// ─── Acceptance Monitor ───────────────────────────────────────────────────────

/**
 * Handles a newly accepted connection request:
 * 1. Waits a random human-like delay (10–45 mins)
 * 2. AI generates a personalised referral request message
 * 3. Sends to Telegram for YOUR approval
 * 4. Only sends to LinkedIn when you tap Approve
 *
 * Flow:
 *   They accept → bot waits ~20 mins → Telegram shows you AI message
 *   → you approve → Chromium sends it
 */
async function handleNewAcceptance(person) {
  const { profileId, name, title, company } = person

  if (seenAcceptances.has(profileId)) return
  seenAcceptances.add(profileId)

  console.log(`🤝 New acceptance detected from: ${name} (${title} at ${company})`)

  // Wait before even generating — looks more human
  await randomAcceptanceDelay()

  // Skip if you already have a pending referral for this person
  if (pendingReferrals.has(profileId)) {
    console.log(`⏭️ Already pending referral for ${name}`)
    return
  }

  try {
    // AI generates personalised referral message based on their profile
    const referralMessage = await generateReferralMessage({ name, title, company })

    pendingReferrals.set(profileId, { reply: referralMessage, name })

    // Send to Telegram for your approval
    await sendReferralApprovalRequest({
      profileId,
      name,
      title,
      company,
      message: referralMessage
    })

    console.log(`📨 Referral approval sent for ${name} — waiting for your approval on Telegram`)
  } catch (e) {
    console.log(`Referral generation error for ${name}:`, e.message)
  }
}

/**
 * Periodically checks for new accepted connection requests.
 * Runs independently from message and job loops.
 */
async function startAcceptanceMonitor() {
  console.log("🤝 Acceptance monitor started")

  while (true) {
    try {
      console.log("🔎 Checking for new acceptances...")
      const acceptances = await checkNewAcceptances()

      if (acceptances && acceptances.length > 0) {
        const newAcceptances = acceptances.filter(a => !seenAcceptances.has(a.profileId))
        if (newAcceptances.length > 0) {
          console.log(`🤝 ${newAcceptances.length} new acceptance(s) found`)
          for (const person of newAcceptances) {
            await handleNewAcceptance(person)
            await delay(3000)
          }
        } else {
          console.log("📭 No new acceptances")
        }
      } else {
        console.log("📭 No acceptances returned")
      }
    } catch (e) {
      console.log("Acceptance monitor error:", e.message)
    }

    // Check every 15–30 mins — acceptances aren't time critical
    const ms = Math.floor(Math.random() * (30 * 60 * 1000 - 15 * 60 * 1000)) + 15 * 60 * 1000
    console.log(`⏳ Next acceptance check in ${(ms / 1000 / 60).toFixed(1)} mins`)
    await delay(ms)
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

/**
 * Processes an unread LinkedIn message:
 * 1. Generates AI CV reply
 * 2. Sends to Telegram for YOUR approval
 * 3. Only sends when you tap Approve — never auto-sends
 */
async function processMessage(sender, message) {
  if (pendingApprovals.has(sender)) {
    console.log(`⏭️ Already pending approval for ${sender}`)
    return
  }

  const aiReply = await generateReply(message)

  pendingApprovals.set(sender, { reply: aiReply, timer: null })

  await sendApprovalRequest({ sender, message, reply: aiReply })
  console.log(`📨 Approval request sent for ${sender} — waiting for your approval on Telegram`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function start() {
  console.log("🚀 Bot starting...")

  let browserReady = false
  while (!browserReady) {
    try {
      await initBrowser()
      browserReady = true
      console.log("✅ Browser ready")
    } catch (err) {
      console.log('❌ Browser init failed:', err.message)
      console.log('🔄 Retrying in 10s...')
      await delay(10000)
    }
  }

  // ── Telegram approval listener for CV replies ──
  listenApproval(async (data) => {
    try {
      const pendingCV = pendingApprovals.get(data.sender)
      const pendingReferral = pendingReferrals.get(data.sender)

      if (pendingCV) {
        clearTimeout(pendingCV.timer)
        pendingApprovals.delete(data.sender)
        console.log(`✅ CV reply approved for ${data.sender} — sending`)
        await sendLinkedInReply(data.reply)          // no profileId — uses lastThreadUrl

      } else if (pendingReferral) {
        pendingReferrals.delete(data.sender)
        console.log(`✅ Referral message approved for ${data.sender} — sending`)
        await sendLinkedInReply(data.reply, data.sender)  // ✅ pass profileId

      } else {
        console.log(`⚠️ No pending approval found for ${data.sender}`)
      }
    } catch (e) {
      console.log('Reply send error:', e.message)
    }
  })

  // Start all monitors in background (independent loops)
  startJobMonitor().catch(e => console.log("Job monitor crashed:", e.message))
  // startAcceptanceMonitor().catch(e => console.log("Acceptance monitor crashed:", e.message))

  // Main message check loop
  while (true) {
    try {
      const results = await checkUnreadMessages()

      if (results && results.length > 0) {
        console.log(`📩 ${results.length} new message(s) detected`)
        await Promise.all(results.map(r => processMessage(r.sender, r.message)))
      } else {
        console.log('📭 No new messages')
      }

    } catch (err) {
      console.log('Loop error:', err.message)
      console.log('🔄 Restarting browser...')

      let restarted = false
      while (!restarted) {
        try {
          await initBrowser()
          restarted = true
          console.log("✅ Browser restarted")
        } catch (e) {
          console.log('❌ Restart failed:', e.message)
          await delay(10000)
        }
      }
    }

    await randomMessageDelay()
  }
}

start()