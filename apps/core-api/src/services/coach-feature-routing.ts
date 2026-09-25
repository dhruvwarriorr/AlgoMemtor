import type {
  CoachFeatureRedirectBlock,
  MentorFeature,
} from '@algomemtor/shared-contracts'

import { extractCoachUrls, providerProblemFromUrl } from './coach-links.js'

// The Coach is the chat. Problem-specific hints and debugging, solution
// exploration, upsolving, contest analysis and progress reports each have a
// dedicated section. A message that clearly asks for one of them gets a
// deterministic pointer to that section instead of a model call. Anything
// ambiguous stays in the chat.

export type CoachFeatureRoute = {
  feature: MentorFeature
  problemUrl?: string
}

const problemReference =
  /\b(this|the|that|a|my|following)\s+(problem|question|task|challenge)\b|\bproblem\s*(link|statement)\b/
const debugging =
  /\b(wrong answer|wa on|tle|mle|time limit|memory limit|runtime error|compil(?:e|ation) error|does ?n[o']?t compile|won'?t compile|no output|not printing|prints nothing|segfault|segmentation fault|debug(?:ging)?|my (?:code|solution|submission) (?:fails|is failing|does ?n[o']?t work|is ?n[o']?t working|gives|gets|got))\b/
const hintIntent =
  /\b(hint|hints|stuck|doubt|nudge|help me (?:with|solve|understand|figure)|can'?t (?:solve|understand|figure)|cannot (?:solve|understand|figure)|do ?n[o']?t understand|how (?:do|should|can|would) i (?:approach|solve|start|think)|approach (?:for|to)|solve this|solution (?:for|to|of)|give me the (?:solution|answer|code))\b/
const genericProblemHelp =
  /\b(help|solve|solution|approach|explain|understand|hint|stuck|code|idea)\b/
const solutionExplorer =
  /\b(?:different|multiple|alternative|alternate|other|several|all(?: the)?|various)\s+(?:ways|approaches|solutions|methods|techniques)\b|\beditorials?\b|\bcommunity solutions?\b|\bcompare (?:the )?(?:approaches|solutions)\b|\bsolution explorer\b|\bbrute[- ]?force\b.{0,20}\b(?:vs\.?|versus|and|to)\b.{0,20}\b(?:optimal|optimized|optimised|efficient)\b/
const upsolve =
  /\bupsolv(?:e|es|ed|ing)\b|\b(?:unsolved|could ?n[o']?t solve|could not solve|missed|left)\b.{0,30}\b(?:from|in|during|after)\b.{0,20}\bcontests?\b/
const contestAnalysis =
  /\b(?:analy[sz]e|analysis|review|breakdown|post-?mortem|debrief)\b.{0,40}\bcontests?\b|\bcontests?\b.{0,40}\b(?:analy[sz]e|analysis|performance|strategy|went wrong|time management|mistakes)\b|\b(?:rating|elo)\s+(?:drop|dropped|dropping|fell|fall|went down|decreased|decrease|loss)\b|\bwhy did (?:my rating|i lose)\b|\bpanic(?:ked|king)?\b.{0,30}\bcontests?\b/
const progressReport =
  /\bprogress report\b|\bhow (?:am i|i am|have i been|i have been) (?:progressing|doing|improving)\b|\bam i (?:improving|getting better|making progress)\b|\bmy (?:progress|growth|improvement)\b|\bhint dependency\b|\baccuracy trend\b|\brating projection\b|\binsight report\b/

export function routeCoachFeature(content: string): CoachFeatureRoute | null {
  const text = content.toLowerCase().replace(/\s+/g, ' ').trim()
  if (text === '') return null
  const urls = extractCoachUrls(content)
  const providerUrl = urls.find((url) => providerProblemFromUrl(url) !== null)
  const problemUrl = providerUrl ?? urls[0]
  const withUrl = (feature: MentorFeature): CoachFeatureRoute =>
    problemUrl === undefined ? { feature } : { feature, problemUrl }

  if (
    solutionExplorer.test(text) &&
    (problemUrl !== undefined || problemReference.test(text))
  ) {
    return withUrl('solution_explorer')
  }
  if (
    providerUrl !== undefined &&
    (debugging.test(text) ||
      hintIntent.test(text) ||
      genericProblemHelp.test(text))
  ) {
    return withUrl('doubt_helper')
  }
  if (debugging.test(text)) return withUrl('doubt_helper')
  if (
    hintIntent.test(text) &&
    (problemUrl !== undefined || problemReference.test(text))
  ) {
    return withUrl('doubt_helper')
  }
  if (upsolve.test(text)) return { feature: 'upsolve' }
  if (contestAnalysis.test(text)) return { feature: 'contest_analysis' }
  if (progressReport.test(text)) return { feature: 'progress_report' }
  return null
}

const copy: Record<
  MentorFeature,
  { title: string; description: string; actionLabel: string; answer: string }
> = {
  doubt_helper: {
    title: 'Doubt Helper',
    description:
      'Step-by-step hints (nudge, concept, structure, key code) and bug diagnosis for wrong answers, TLE, compile errors or missing output, without spoiling the answer.',
    actionLabel: 'Open Doubt Helper',
    answer:
      'This is a job for the **Doubt Helper**. It works through your doubt one hint at a time, and diagnoses wrong answers, TLE, compile errors or missing output, so you still get the win of solving it yourself. Paste your code there if you are debugging; it is used for that answer only and never saved.',
  },
  solution_explorer: {
    title: 'Solution Explorer',
    description:
      'Brute force, optimized and alternative approaches with complexity trade-offs, plus the editorial and the most instructive community write-ups.',
    actionLabel: 'Explore solutions',
    answer:
      'Comparing approaches is what the **Solution Explorer** is for. It lays out the brute force, the optimized idea and genuinely different alternatives with their complexity trade-offs, and points you to the editorial and the most instructive community write-ups. It opens after you have solved or genuinely attempted the problem.',
  },
  upsolve: {
    title: 'Upsolve Tracker',
    description:
      'Every unsolved problem from your recent contests, prioritized, with hints, editorials and your upsolve completion rate.',
    actionLabel: 'Open upsolve queue',
    answer:
      'Your **Upsolve Tracker** already has this. It flags the problems you missed in recent contests, orders them by what will teach you most, and tracks how consistently you follow through. Each problem links to hints, the editorial and the Solution Explorer.',
  },
  contest_analysis: {
    title: 'Contest Analysis',
    description:
      'Time management, panic signals, weak contest topics, rating-change causes and strategy for your next contest, per contest and across contests.',
    actionLabel: 'Analyze my contests',
    answer:
      'Head to **Contest Analysis** for this. It breaks each contest down from your submission timeline (time spent per problem, problem switches, rapid resubmits, idle stretches), explains rating changes, and tracks patterns across contests.',
  },
  progress_report: {
    title: 'Progress Report',
    description:
      'Topic progress, first-try accuracy, solving speed, rating trajectory, consistency and hint dependency, with a written insight report.',
    actionLabel: 'Open progress report',
    answer:
      'Your **Progress Report** tracks exactly this: topic progress, first-try accuracy, contest solving speed, rating trajectory, consistency and how much you rely on hints, with specific insights about what to do next.',
  },
}

export function coachFeatureRedirect(route: CoachFeatureRoute): {
  answer: string
  block: CoachFeatureRedirectBlock
} {
  const text = copy[route.feature]
  const carriesProblem =
    route.problemUrl !== undefined &&
    (route.feature === 'doubt_helper' || route.feature === 'solution_explorer')
  return {
    answer: carriesProblem
      ? `${text.answer} I have carried your problem link over.`
      : text.answer,
    block: {
      type: 'feature_redirect',
      feature: route.feature,
      title: text.title,
      description: text.description,
      actionLabel: text.actionLabel,
      ...(carriesProblem && route.problemUrl !== undefined
        ? { problemUrl: route.problemUrl }
        : {}),
    },
  }
}
