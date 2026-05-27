require('dotenv').config()

const {
  initBrowser,
  checkUnreadMessages,
  sendLinkedInReply,
} = require('./bot/linkedin')

const {
  generateReply,
} = require('./ai/openai')

const {
  sendApprovalRequest,
  listenApproval,
} = require('./telegram/telegram')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function start() {

  await initBrowser()

  listenApproval(async (data) => {

    console.log('Approved by user')

    await sendLinkedInReply(data.reply)
  })

  while (true) {

    try {

      const result = await checkUnreadMessages()

      if (result) {
        console.log('New message detected')
        const aiReply = await generateReply(result.message)
        await sendApprovalRequest({
          sender: result.sender,
          message: result.message,
          reply: aiReply,
        })
      }

    } catch (err) {
      console.log(err)
    }

    await delay(15000)
  }
}

start()