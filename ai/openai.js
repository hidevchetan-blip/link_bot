require('dotenv').config()

const OpenAI = require('openai')

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

async function generateReply(message) {
      return "hello there"
    const response = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
            {
                role: 'system',
                content: `
You are a professional assistant.
Reply politely and professionally.
Keep response short.
Mention PDF attachment when needed.
        `,
            },
            {
                role: 'user',
                content: message,
            },
        ],
    })

    return response.choices[0].message.content
}

async function generateReferralMessage(message) {
    return "pls provide my refferal"
  const response = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
          {
              role: 'system',
              content: `
You are a professional assistant.
Reply politely and professionally.
Keep response short.
Mention PDF attachment when needed.
      `,
          },
          {
              role: 'user',
              content: message,
          },
      ],
  })

  return response.choices[0].message.content
}


module.exports = {
    generateReply,
    generateReferralMessage
}
