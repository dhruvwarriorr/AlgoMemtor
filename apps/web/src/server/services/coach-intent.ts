// Mirrors apps/ai-api/app/coach_intent.py. A greeting or thank-you needs
// one short reply, not a rebuilt roadmap, the full provider history, memory
// retrieval, and a multi-step agent turn. The AI service classifies again, so
// the two only need to agree on the obvious cases.

const smallTalkWords = new Set([
  'hi',
  'hii',
  'hiii',
  'hello',
  'helo',
  'hey',
  'heyy',
  'heyyy',
  'hlo',
  'yo',
  'sup',
  'wassup',
  'whatsup',
  'hola',
  'namaste',
  'howdy',
  'greetings',
  'gm',
  'gn',
  'good',
  'morning',
  'afternoon',
  'evening',
  'night',
  'there',
  'again',
  'thanks',
  'thank',
  'thx',
  'ty',
  'tysm',
  'thankyou',
  'you',
  'u',
  'so',
  'much',
  'a',
  'lot',
  'ok',
  'okay',
  'okk',
  'k',
  'kk',
  'cool',
  'nice',
  'great',
  'awesome',
  'perfect',
  'sure',
  'alright',
  'got',
  'it',
  'understood',
  'makes',
  'sense',
  'yes',
  'yeah',
  'yep',
  'yup',
  'no',
  'nope',
  'nah',
  'fine',
  'lol',
  'lmao',
  'haha',
  'hahaha',
  'hehe',
  'hmm',
  'hmmm',
  'wow',
  'bye',
  'goodbye',
  'see',
  'ya',
  'later',
  'cya',
  'take',
  'care',
  'coach',
  'bro',
  'buddy',
  'man',
  'mate',
  'dude',
  'sir',
  'friend',
  'algomemtor',
  'bot',
  'all',
  'everyone',
  'and',
])

const smallTalkAnchors = new Set([
  'hi',
  'hii',
  'hiii',
  'hello',
  'helo',
  'hey',
  'heyy',
  'heyyy',
  'hlo',
  'yo',
  'sup',
  'wassup',
  'whatsup',
  'hola',
  'namaste',
  'howdy',
  'greetings',
  'gm',
  'gn',
  'morning',
  'afternoon',
  'evening',
  'thanks',
  'thank',
  'thx',
  'ty',
  'tysm',
  'thankyou',
  'lol',
  'lmao',
  'haha',
  'hahaha',
  'hehe',
  'bye',
  'goodbye',
  'cya',
])

const metaQuestion =
  /^(?:hi|hello|hey)?[\s,!]*(?:how\s+are\s+(?:you|u)(?:\s+doing)?|how's\s+it\s+going|what's\s+up|who\s+are\s+(?:you|u)|what\s+are\s+(?:you|u)|what\s+can\s+(?:you|u)\s+do|what\s+do\s+(?:you|u)\s+do|how\s+can\s+(?:you|u)\s+help(?:\s+me)?|what\s+can\s+(?:you|u)\s+help\s+(?:me\s+)?with|are\s+(?:you|u)\s+(?:there|an?\s+ai|a\s+bot|real))\s*\??$/

export function isCoachSmallTalk(question: string) {
  const stripped = question.trim()
  if (stripped === '' || stripped.length > 80) return false
  const text = stripped
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text === '') return true
  if (metaQuestion.test(text)) return true
  const words = text.split(' ')
  if (words.length > 8) return false
  return (
    words.every((word) => smallTalkWords.has(word)) &&
    words.some((word) => smallTalkAnchors.has(word))
  )
}
