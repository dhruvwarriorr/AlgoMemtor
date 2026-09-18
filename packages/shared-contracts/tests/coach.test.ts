import { describe, expect, it } from 'vitest'

import {
  CoachActionProposalSchema,
  CoachMessageSchema,
  CoachRichContentSchema,
  CoachCheckInActionRequestSchema,
  CoachCheckInSchema,
  CoachCitationSchema,
  ImprovementRoadmapSchema,
} from '../src/coach.js'

const timestamp = '2026-09-16T00:00:00.000Z'

const evidence = {
  uniqueProblems: 3,
  solvedProblems: 2,
  attemptedProblems: 3,
  acceptedSubmissions: 2,
  totalSubmissions: 3,
  contestSignals: 0,
  recentDays: 2,
  completeness: 'partial' as const,
  stale: false,
}

const topic = {
  topic: 'arrays',
  name: 'Arrays',
  lane: 'current_focus' as const,
  manualStatus: 'working_on' as const,
  assessment: 'developing' as const,
  score: 0.6,
  confidence: 0.5,
  reason: 'The learner selected Arrays as the current focus.',
  evidence,
  prerequisites: ['implementation'],
  suggestions: [],
  updatedAt: timestamp,
}

describe('coach contracts', () => {
  it('rejects action proposals without the payload required by their type', () => {
    expect(
      CoachActionProposalSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000001',
        actionType: 'set_topic_status',
        status: 'proposed',
        label: 'Update roadmap',
        reason: 'The evidence supports a focus change.',
      }).success,
    ).toBe(false)
  })

  it('requires a real state change for check-in actions', () => {
    expect(CoachCheckInActionRequestSchema.safeParse({}).success).toBe(false)
    expect(CoachCheckInActionRequestSchema.parse({ dismissed: true })).toEqual({
      dismissed: true,
    })
  })

  it('accepts dismissed and fallback check-in state', () => {
    const checkIn = CoachCheckInSchema.parse({
      id: '00000000-0000-4000-8000-000000000002',
      type: 'weekly_review',
      title: 'Weekly review',
      content: 'Review one focused practice block.',
      evidence: [],
      read: true,
      dismissed: true,
      fallback: true,
      createdAt: timestamp,
    })

    expect(checkIn.dismissed).toBe(true)
    expect(checkIn.fallback).toBe(true)
  })

  it('keeps roadmap topic and suggestion bounds runtime-validated', () => {
    expect(
      ImprovementRoadmapSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000003',
        version: 1,
        assessmentVersion: 'topic-assessment-v1',
        topics: [topic],
        dataCompleteness: 'partial',
        staleProviders: [],
        generatedAt: timestamp,
      }).success,
    ).toBe(true)
    expect(
      ImprovementRoadmapSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000003',
        version: 1,
        assessmentVersion: 'topic-assessment-v1',
        topics: [
          {
            ...topic,
            suggestions: Array.from({ length: 6 }, (_, index) => ({
              id: `00000000-0000-4000-8000-00000000000${index + 1}`,
              problem: {
                provider: 'codeforces',
                externalId: `${100 + index}A`,
                title: `Arrays ${index}`,
                canonicalUrl: `https://codeforces.com/problemset/problem/${100 + index}/A`,
                providerTags: ['arrays'],
                topics: ['arrays'],
                fetchedAt: timestamp,
              },
              reason: 'A bounded practice step.',
              band: 'target' as const,
              status: 'suggested' as const,
              createdAt: timestamp,
            })),
          },
        ],
        dataCompleteness: 'partial',
        staleProviders: [],
        generatedAt: timestamp,
      }).success,
    ).toBe(false)
  })

  it('validates rich coach blocks and preserves legacy messages', () => {
    const richContent = CoachRichContentSchema.parse({
      version: 'coach-rich-v2',
      blocks: [
        {
          type: 'chart',
          datasetId: 'topic-assessments',
          chartType: 'bar',
          title: 'Topic readiness',
          summary: 'Deterministic assessment signals.',
          series: [{ key: 'score', label: 'Score' }],
          points: [{ label: 'Arrays', values: { score: 70 } }],
          citationIds: [],
        },
      ],
      citations: [
        {
          id: 'roadmap',
          source: 'learner',
          title: 'Roadmap assessment',
          retrievedAt: timestamp,
          stale: false,
        },
      ],
      suggestedQuestions: ['Give me a progressive hint.'],
      generatedAt: timestamp,
      dataAsOf: timestamp,
      completeness: 'partial',
      stale: true,
    })
    expect(
      CoachMessageSchema.parse({
        id: '00000000-0000-4000-8000-000000000004',
        role: 'assistant',
        content: 'Use the current focus first.',
        evidence: [],
        proposals: [],
        richContent,
        createdAt: timestamp,
      }).richContent?.version,
    ).toBe('coach-rich-v2')
    expect(
      CoachRichContentSchema.safeParse({
        ...richContent,
        blocks: [
          {
            ...richContent.blocks[0],
            chartType: 'pie',
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      CoachRichContentSchema.safeParse({
        ...richContent,
        blocks: [
          {
            ...richContent.blocks[0],
            points: [{ label: 'Arrays', values: { unknown: 1 } }],
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      CoachRichContentSchema.safeParse({
        ...richContent,
        blocks: [
          {
            ...richContent.blocks[0],
            citationIds: ['missing-citation'],
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      CoachRichContentSchema.safeParse({
        ...richContent,
        blocks: [
          {
            type: 'comparison_table',
            title: 'Comparison',
            columns: ['Topic', 'Score'],
            rows: [['Arrays']],
            citationIds: [],
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('accepts only public HTTPS web citations', () => {
    const base = {
      id: 'web-source',
      source: 'web' as const,
      title: 'Public reference',
      retrievedAt: timestamp,
      stale: false,
    }
    expect(
      CoachCitationSchema.safeParse({
        ...base,
        url: 'https://example.com/reference',
      }).success,
    ).toBe(true)
    for (const url of [
      'http://example.com/reference',
      'https://localhost/reference',
      'https://172.20.0.1/reference',
      'https://[fd00::1]/reference',
      'https://2130706433/reference',
      'https://user:secret@example.com/reference',
    ]) {
      expect(CoachCitationSchema.safeParse({ ...base, url }).success).toBe(false)
    }
    expect(CoachCitationSchema.safeParse(base).success).toBe(false)
  })
})
