const { generateReply } = require("./ai/openai")
const { initBrowser, sendLinkedInReply, checkUnreadMessages } = require("./bot/linkedin")
const { listenApproval, sendApprovalRequest } = require("./telegram/telegram")

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000  // 5 minutes, then auto-send

// pendingApprovals: keyed by sender, holds { reply, timer }
const pendingApprovals = new Map()

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomDelay() {
  const ms = Math.floor(Math.random() * 30000) + 45000
  console.log(`⏳ Next check in ${(ms / 1000).toFixed(1)}s`)
  return delay(ms)
}

async function autoSend(sender, reply) {
  try {
    console.log(`⏰ Auto-sending reply to ${sender} (no approval received)`)
    await sendLinkedInReply(reply)
  } catch (e) {
    console.log(`Auto-send error for ${sender}:`, e.message)
  } finally {
    pendingApprovals.delete(sender)
  }
}

async function processMessage(sender, message) {
  // Skip if already waiting on approval for this sender
  if (pendingApprovals.has(sender)) {
    console.log(`⏭️ Already pending approval for ${sender}`)
    return
  }

  const aiReply = await generateReply(message)

  // Start auto-send timer (fires if Telegram not approved in time)
  const timer = setTimeout(() => autoSend(sender, aiReply), APPROVAL_TIMEOUT_MS)
  pendingApprovals.set(sender, { reply: aiReply, timer })

  await sendApprovalRequest({ sender, message, reply: aiReply })
  console.log(`📨 Approval request sent for ${sender} (auto-sends in 5 min)`)
}

async function start() {
  console.log("🚀 Bot starting...")

  let browserReady = false
  while (!browserReady) {
    try {
      await initBrowser()
      browserReady = true
    } catch (err) {
      console.log('❌ Browser init failed:', err.message)
      console.log('🔄 Retrying in 10s...')
      await delay(10000)
    }
  }

  // ✅ Telegram approval clears the timer and sends immediately
  listenApproval(async (data) => {
    try {
      const pending = pendingApprovals.get(data.sender)
      if (pending) {
        clearTimeout(pending.timer)
        pendingApprovals.delete(data.sender)
      }
      console.log(`✅ Approved by user for ${data.sender}`)
      await sendLinkedInReply(data.reply)
    } catch (e) {
      console.log('Reply error:', e.message)
    }
  })

  while (true) {
    try {
      const results = await checkUnreadMessages()  // now returns array

      if (results && results.length > 0) {
        console.log(`📩 ${results.length} new message(s) detected`)
        // Process all in parallel (each gets its own timer)
        await Promise.all(results.map(r => processMessage(r.sender, r.message)))
      } else {
        console.log('📭 No new resume requests')
      }

    } catch (err) {
      console.log('Loop error:', err.message)
      console.log('🔄 Restarting browser...')

      let restarted = false
      while (!restarted) {
        try {
          await initBrowser()
          restarted = true
        } catch (e) {
          console.log('❌ Restart failed:', e.message)
          await delay(10000)
        }
      }
    }

    await randomDelay()
  }
}

start()