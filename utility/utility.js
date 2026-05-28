export function getPostedDays(postedAt) {
    if (!postedAt) return 999
  
    const text = postedAt.toLowerCase()
  
    // examples: "1 day ago", "3 days ago"
    const dayMatch = text.match(/(\d+)\s*day/)
    if (dayMatch) return parseInt(dayMatch[1])
  
    // "2 hours ago" → treat as 0 days
    const hourMatch = text.match(/(\d+)\s*hour/)
    if (hourMatch) return 0
  
    // "1 week ago"
    const weekMatch = text.match(/(\d+)\s*week/)
    if (weekMatch) return parseInt(weekMatch[1]) * 7
  
    // "1 month ago"
    const monthMatch = text.match(/(\d+)\s*month/)
    if (monthMatch) return parseInt(monthMatch[1]) * 30
  
    return 999
  }

  export function buildPeopleUrl(companyUrl) {
    if (!companyUrl) return null
  
    try {
      const url = new URL(companyUrl)
  
      // ensure proper LinkedIn format
      if (!url.pathname.endsWith('/')) {
        url.pathname += '/'
      }
  
      return `https://www.linkedin.com${url.pathname}people/`
    } catch (e) {
      return null
    }
  }

  export function escapeMarkdownV2(text = '') {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
  }