import type { PetLine } from './mello-events'

// What the pet says when the learner opens a page. Each page speaks once per
// visit to the site (per tab), so moving around does not become chatter.
const routeLines: ReadonlyArray<{ match: RegExp; line: PetLine }> = [
  {
    match: /^\/dashboard\/?$/,
    line: {
      message: 'Welcome back! Your momentum is right here.',
      state: 'greet',
    },
  },
  {
    match: /^\/coach(\/|$)/,
    line: {
      message: 'Ask me anything. I know your whole journey.',
      state: 'idea',
    },
  },
  {
    match: /^\/recommendations(\/|$)/,
    line: {
      message: 'Fresh picks, chosen for where you are today.',
      state: 'idea',
    },
  },
  {
    match: /^\/visualizer(\/|$)/,
    line: {
      message: 'Let’s watch your code run, one step at a time!',
      state: 'awe',
    },
  },
  {
    match: /^\/doubt-helper(\/|$)/,
    line: {
      message: 'Stuck? We’ll crack it together, one hint at a time.',
      state: 'teaching',
    },
  },
  {
    match: /^\/solutions(\/|$)/,
    line: {
      message: 'Every way to solve it, brute force to optimal.',
      state: 'reading',
    },
  },
  {
    match: /^\/upsolve(\/|$)/,
    line: {
      message: 'Upsolving is where rating really comes from.',
      state: 'idea',
    },
  },
  {
    match: /^\/contest-analysis(\/|$)/,
    line: {
      message: 'Let’s replay your contests and find the pattern.',
      state: 'reading',
    },
  },
  {
    match: /^\/progress\/report(\/|$)/,
    line: {
      message: 'Your report card is ready. Let’s read it together.',
      state: 'reading',
    },
  },
  {
    match: /^\/progress\/?$/,
    line: { message: 'Look how far you have come!', state: 'success' },
  },
  {
    match: /^\/(insights|analytics)(\/|$)/,
    line: { message: 'Numbers time! I love a good chart.', state: 'reading' },
  },
  {
    match: /^\/settings(\/|$)/,
    line: {
      message: 'Tweaking things? You can pick my look here too.',
      state: 'greet',
    },
  },
  {
    match: /^\/profile(\/|$)/,
    line: {
      message: 'The more I know you, the better I coach.',
      state: 'idea',
    },
  },
  {
    match: /^\/bookmarks(\/|$)/,
    line: { message: 'Your saved problems, waiting for you.', state: 'idle' },
  },
  {
    match: /^\/problems(\/|$)/,
    line: {
      message: 'So many problems, so little time. Let’s pick well.',
      state: 'scroll',
    },
  },
  {
    match: /^\/contests(\/|$)/,
    line: {
      message: 'Next contest on the calendar? I’ll cheer you on.',
      state: 'greet',
    },
  },
  {
    match: /^\/memory(\/|$)/,
    line: { message: 'This is what I remember about you.', state: 'thinking' },
  },
]

export function routeLine(pathname: string): PetLine | null {
  return routeLines.find((item) => item.match.test(pathname))?.line ?? null
}

// Lines for things the learner does, spoken wherever they happen.
export const petLines = {
  syncStarted: 'Reading your latest solves…',
  syncDone: { message: 'All synced! Fresh data is in.', state: 'success' },
  syncCooldown: {
    message: 'Just synced a moment ago. Give it a few minutes.',
    state: 'idle',
  },
  syncFailed: { message: 'Hmm, the sync hit a snag.', state: 'thinking' },
  visualizerRun: 'Tracing every step…',
  visualizerDone: { message: 'Trace ready. Press play!', state: 'idea' },
  visualizerDebug: 'Looking for the bug with you…',
  doubtStarted: 'Got your doubt. Reading the problem…',
  hintReady: { message: 'Your next hint is ready.', state: 'idea' },
  doubtSolved: {
    message: 'You solved it! That one is yours.',
    state: 'success',
  },
  exploreStarted: 'Reading the problem and its solutions…',
  exploreDone: {
    message: 'Three approaches, ready to compare.',
    state: 'teaching',
  },
  bookmarkSaved: { message: 'Saved for later!', state: 'success' },
  recommendationsRefresh: 'Picking fresh problems for you…',
  settingsSaved: { message: 'Saved. I’ll remember that.', state: 'success' },
  petChosen: (name: string): PetLine => ({
    message: `Hi, I’m ${name}! I’ll be your coach from now on.`,
    state: 'greet',
    ms: 5_000,
  }),
} satisfies Record<string, string | PetLine | ((name: string) => PetLine)>
