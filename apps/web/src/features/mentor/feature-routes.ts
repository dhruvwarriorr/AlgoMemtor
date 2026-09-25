import type {
  InsightLinkTarget,
  MentorFeature,
} from '@algomemtor/shared-contracts'

import {
  BarChart3,
  BookOpen,
  Crosshair,
  Swords,
  Trophy,
  TrendingUp,
  Lightbulb,
  type IconComponent,
} from '@/components/icons/algo-icons-line'

export type MentorTool = {
  feature: MentorFeature
  label: string
  path: string
  description: string
  icon: IconComponent
}

// In-app routes for the dedicated sections. The Coach chat only ever links to
// these known paths; a problem link travels as a validated query parameter.
export const mentorTools: Record<MentorFeature, MentorTool> = {
  doubt_helper: {
    feature: 'doubt_helper',
    label: 'Doubt Helper',
    path: '/doubt-helper',
    description: 'Layered hints and bug diagnosis for a specific problem.',
    icon: Crosshair,
  },
  solution_explorer: {
    feature: 'solution_explorer',
    label: 'Solution Explorer',
    path: '/solutions',
    description: 'Brute force, optimized and alternative approaches.',
    icon: BookOpen,
  },
  upsolve: {
    feature: 'upsolve',
    label: 'Upsolve',
    path: '/upsolve',
    description: 'Your prioritized queue of missed contest problems.',
    icon: Swords,
  },
  contest_analysis: {
    feature: 'contest_analysis',
    label: 'Contest analysis',
    path: '/contest-analysis',
    description: 'Time use, panic signals and strategy per contest.',
    icon: Trophy,
  },
  progress_report: {
    feature: 'progress_report',
    label: 'Progress report',
    path: '/progress/report',
    description: 'Accuracy, speed, rating trajectory and hint reliance.',
    icon: TrendingUp,
  },
}

export const orderedMentorTools: readonly MentorTool[] = [
  mentorTools.doubt_helper,
  mentorTools.solution_explorer,
  mentorTools.upsolve,
  mentorTools.contest_analysis,
  mentorTools.progress_report,
]

export function mentorToolPath(feature: MentorFeature, problemUrl?: string) {
  const { path } = mentorTools[feature]
  return problemUrl === undefined
    ? path
    : `${path}?${new URLSearchParams({ problem: problemUrl }).toString()}`
}

export function insightTargetPath(target: InsightLinkTarget) {
  return target === 'recommendations'
    ? '/recommendations'
    : mentorTools[target].path
}

export const insightTargetIcon = (target: InsightLinkTarget): IconComponent =>
  target === 'recommendations'
    ? Lightbulb
    : (mentorTools[target]?.icon ?? BarChart3)
