require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const { escapeMarkdownV2 } = require('../utility/utility')

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
})

// ✅ Don't crash on polling errors
bot.on('polling_error', (err) => {
  console.log('⚠️ Telegram polling error:', err.message)
})

bot.on('error', (err) => {
  console.log('⚠️ Telegram error:', err.message)
})

const pendingApprovals = {}

async function sendApprovalRequest(data) {
  try {
    const id = Date.now().toString()
    pendingApprovals[id] = data

    const text = `
🔔 New LinkedIn Message

👤 From: ${data.sender}

💬 Message:
${data.message}

🤖 AI Draft:
${data.reply}
    `

    await bot.sendMessage(
      process.env.TELEGRAM_CHAT_ID,
      text,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Approve',
                callback_data: `approve_${id}`,
              },
              {
                text: '❌ Reject',
                callback_data: `reject_${id}`,
              },
            ],
          ],
        },
      }
    )

    console.log('📤 Approval request sent to Telegram')

  } catch (err) {
    console.log('sendApprovalRequest error:', err.message)
  }
}

/**
 * Sends a referral message approval request to Telegram.
 * Same pattern as sendApprovalRequest but styled for referral context.
 *
 * Uses prefix `referral_approve_` and `referral_reject_` on callback_data
 * so listenApproval can distinguish it from a CV reply approval.
 */
async function sendReferralApprovalRequest({ profileId, name, title, company, message }) {
  try {
    const id = Date.now().toString()

    // Store with same structure as CV approvals so listenApproval callback works
    pendingApprovals[id] = {
      sender: profileId,  // profileId used as key — matches pendingReferrals in index.js
      reply: message,
      type: 'referral'
    }

    const text = `
🤝 New Connection Accepted!

👤 Name: ${name}
💼 Role: ${title}
🏢 Company: ${company}

🤖 AI Referral Message Draft:
${message}
    `

    await bot.sendMessage(
      process.env.TELEGRAM_CHAT_ID,
      text,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Send Referral Message',
                callback_data: `approve_${id}`,
              },
              {
                text: '❌ Skip',
                callback_data: `reject_${id}`,
              },
            ],
          ],
        },
      }
    )

    console.log(`📤 Referral approval request sent for ${name}`)

  } catch (err) {
    console.log('sendReferralApprovalRequest error:', err.message)
  }
}

function listenApproval(callback) {
  bot.on('callback_query', async (query) => {
    try {
      const data = query.data

      if (data.startsWith('approve_')) {
        const id = data.replace('approve_', '')

        if (pendingApprovals[id]) {
          callback(pendingApprovals[id])

          await bot.answerCallbackQuery(query.id, {
            text: '✅ Approved',
          })

          delete pendingApprovals[id]
        }
      }

      if (data.startsWith('reject_')) {
        const id = data.replace('reject_', '')

        delete pendingApprovals[id]

        await bot.answerCallbackQuery(query.id, {
          text: '❌ Rejected',
        })

        console.log('🚫 Reply rejected')
      }

    } catch (err) {
      console.log('callback_query error:', err.message)
    }
  })
}

/**
 * Sends a job alert notification to your Telegram chat.
 */
async function sendJobNotification({ title, company, postedAt, jobUrl, peopleUrl }) {

  const text =
    `💼 <b>New Job Posted!</b>\n\n` +
    `<b>Role:</b> ${title}\n` +
    `<b>Company:</b> ${company}\n` +
    `<b>Posted:</b> ${postedAt}\n\n` +
    `📋 <b>Apply Now:</b> ${jobUrl}\n` +
    `👥 <b>Employees:</b> ${peopleUrl || 'Not available'}`
  
  await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, text, {
    parse_mode: 'HTML'
  })
}

module.exports = {
  sendApprovalRequest,
  sendReferralApprovalRequest,
  listenApproval,
  sendJobNotification
}