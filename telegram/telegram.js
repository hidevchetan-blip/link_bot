require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')

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

module.exports = {
  sendApprovalRequest,
  listenApproval,
}