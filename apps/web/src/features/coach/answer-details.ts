import type { CoachMessage, CoachRichBlock } from '@algomemtor/shared-contracts'

import { splitCoachAnswer } from './answer-parts'

type DataBlock = Exclude<
  CoachRichBlock,
  { type: 'problem_list' } | { type: 'web_problem_list' }
>

const isDataBlock = (block: CoachRichBlock): block is DataBlock =>
  block.type !== 'problem_list' && block.type !== 'web_problem_list'

export function answerDetails(message: CoachMessage | undefined) {
  const blocks = message?.richContent?.blocks ?? []
  const codeBlocks =
    message === undefined ? [] : splitCoachAnswer(message.content).codeBlocks
  const picked = blocks.filter((block) => block.type === 'problem_list')
  const web = blocks.filter((block) => block.type === 'web_problem_list')
  const data = blocks.filter(isDataBlock)
  const citations = message?.richContent?.citations ?? []
  const evidence = message?.evidence ?? []
  const proposals = message?.proposals ?? []
  const followUps = message?.richContent?.suggestedQuestions ?? []
  const problemCount = picked.reduce(
    (total, block) => total + block.problems.length,
    0,
  )
  const webCount = web.reduce(
    (total, block) => total + block.problems.length,
    0,
  )
  return {
    picked,
    web,
    data,
    codeBlocks,
    citations,
    evidence,
    proposals,
    followUps,
    problemCount,
    webCount,
    sourceCount: citations.length + evidence.length,
    // Anything worth opening the panel for (follow-ups alone are not).
    hasContent:
      picked.length +
        web.length +
        data.length +
        codeBlocks.length +
        proposals.length +
        citations.length +
        evidence.length >
      0,
  }
}

export function answerDetailsSummary(
  details: ReturnType<typeof answerDetails>,
) {
  const parts: string[] = []
  if (details.problemCount > 0) {
    parts.push(
      `${details.problemCount} problem${details.problemCount === 1 ? '' : 's'}`,
    )
  }
  if (details.codeBlocks.length > 0) {
    parts.push(
      `${details.codeBlocks.length} code block${details.codeBlocks.length === 1 ? '' : 's'}`,
    )
  }
  if (details.webCount > 0) {
    parts.push(
      `${details.webCount} web link${details.webCount === 1 ? '' : 's'}`,
    )
  }
  if (details.data.length > 0) {
    parts.push(
      `${details.data.length} chart${details.data.length === 1 ? '' : 's'}`,
    )
  }
  if (details.proposals.length > 0) {
    parts.push(
      `${details.proposals.length} action${details.proposals.length === 1 ? '' : 's'}`,
    )
  }
  if (details.sourceCount > 0) {
    parts.push(
      `${details.sourceCount} source${details.sourceCount === 1 ? '' : 's'}`,
    )
  }
  return parts.join(' · ')
}

export const coachCodeBlockId = (messageId: string, index: number) =>
  `coach-code-${messageId}-${index}`
