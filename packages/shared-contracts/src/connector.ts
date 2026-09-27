import { z } from 'zod'

import {
  ConnectorOnlyProviderSchema,
  PublicProviderHandleSchema,
} from './provider-account.js'

// The browser connector reads a learner's own signed-in provider data in their
// browser and sends normalized records. It never sends cookies, passwords,
// source code, or provider-built URLs; the server builds canonical URLs from
// the validated identifiers below.

// CodeChef is read in the browser too: its public feed leaves out some
// solves, and the learner's own session also shows each contest problem's
// rating.
export const ConnectorProviderSchema = z.enum(['leetcode', 'cses', 'codechef'])
export type ConnectorProvider = z.infer<typeof ConnectorProviderSchema>

export const ConnectorTokenSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(64),
    createdAt: z.iso.datetime({ offset: true }),
    lastUsedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
export type ConnectorToken = z.infer<typeof ConnectorTokenSchema>

export const ConnectorTokensResponseSchema = z
  .object({ data: z.array(ConnectorTokenSchema).max(20) })
  .strict()
export type ConnectorTokensResponse = z.infer<
  typeof ConnectorTokensResponseSchema
>

export const RevokeConnectorTokenResponseSchema = z
  .object({ data: z.object({ id: z.uuid() }).strict() })
  .strict()
export type RevokeConnectorTokenResponse = z.infer<
  typeof RevokeConnectorTokenResponseSchema
>

export const CreateConnectorTokenRequestSchema = z
  .object({ label: z.string().trim().min(1).max(64) })
  .strict()
export type CreateConnectorTokenRequest = z.infer<
  typeof CreateConnectorTokenRequestSchema
>

// The secret is returned exactly once, at creation.
export const ConnectorSecretSchema = z
  .string()
  .regex(/^amc_[A-Za-z0-9_-]{43}$/, 'Invalid connector token.')

export const CreateConnectorTokenResponseSchema = z
  .object({
    data: z
      .object({ token: ConnectorTokenSchema, secret: ConnectorSecretSchema })
      .strict(),
  })
  .strict()
export type CreateConnectorTokenResponse = z.infer<
  typeof CreateConnectorTokenResponseSchema
>

export const ConnectorSessionResponseSchema = z
  .object({
    data: z
      .object({
        tokenLabel: z.string().trim().min(1).max(64),
        accounts: z
          .array(
            z
              .object({
                provider: ConnectorProviderSchema,
                handle: PublicProviderHandleSchema,
                verified: z.boolean(),
              })
              .strict(),
          )
          .max(3),
      })
      .strict(),
  })
  .strict()
export type ConnectorSessionResponse = z.infer<
  typeof ConnectorSessionResponseSchema
>

const leetCodeSlugSchema = z.string().regex(/^[a-z0-9-]{1,128}$/)
const csesTaskIdSchema = z.string().regex(/^[1-9][0-9]{0,5}$/)
const codeChefCodeSchema = z.string().regex(/^[A-Za-z0-9_]{1,64}$/)

export const connectorProblemIdSchema = (provider: ConnectorProvider) =>
  provider === 'leetcode'
    ? leetCodeSlugSchema
    : provider === 'codechef'
      ? codeChefCodeSchema
      : csesTaskIdSchema

const titleSchema = z.string().trim().min(1).max(512)

export const ConnectorSubmissionSchema = z
  .object({
    eventId: z.string().regex(/^[0-9]{1,20}$/),
    externalId: z.string().min(1).max(128),
    problemTitle: titleSchema.optional(),
    verdict: z.string().trim().min(1).max(64),
    isAccepted: z.boolean(),
    language: z.string().trim().min(1).max(64).optional(),
    occurredAt: z.iso.datetime({ offset: true }),
    runtimeMs: z.number().int().nonnegative().max(3_600_000).optional(),
    memoryKb: z.number().int().nonnegative().max(100_000_000).optional(),
    passedTestCount: z.number().int().nonnegative().max(100_000).optional(),
  })
  .strict()
export type ConnectorSubmission = z.infer<typeof ConnectorSubmissionSchema>

export const ConnectorSolvedProblemSchema = z
  .object({
    externalId: z.string().min(1).max(128),
    title: titleSchema.optional(),
    // The CSES problemset section the task is listed under, used as its tag.
    section: z.string().trim().min(1).max(64).optional(),
    // CodeChef: where the problem was solved. A solve inside a contest keeps
    // the problem's CodeChef difficulty rating; a practice solve is unrated.
    solveContext: z.enum(['contest', 'practice']).optional(),
    contestCode: z
      .string()
      .regex(/^[A-Za-z0-9_]{1,64}$/)
      .optional(),
    difficultyRating: z.number().int().positive().max(10_000).optional(),
  })
  .strict()
export type ConnectorSolvedProblem = z.infer<
  typeof ConnectorSolvedProblemSchema
>

export const ConnectorIngestRequestSchema = z
  .object({
    provider: ConnectorProviderSchema,
    // The signed-in username (LeetCode, CodeChef) or numeric user ID (CSES)
    // that the connector read from the provider session.
    account: z.object({ handle: PublicProviderHandleSchema }).strict(),
    submissions: z.array(ConnectorSubmissionSchema).max(1000),
    // The provider's own list of problems it marks as solved for this account.
    // Sent in full or not at all (`solvedListComplete`).
    solvedProblems: z.array(ConnectorSolvedProblemSchema).max(5000),
    solvedListComplete: z.boolean(),
    // True once the connector has sent the account's whole submission history.
    historyComplete: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const idSchema = connectorProblemIdSchema(value.provider)
    value.submissions.forEach((submission, index) => {
      if (!idSchema.safeParse(submission.externalId).success) {
        context.addIssue({
          code: 'custom',
          message: 'Invalid problem identifier for this provider.',
          path: ['submissions', index, 'externalId'],
        })
      }
    })
    value.solvedProblems.forEach((problem, index) => {
      if (!idSchema.safeParse(problem.externalId).success) {
        context.addIssue({
          code: 'custom',
          message: 'Invalid problem identifier for this provider.',
          path: ['solvedProblems', index, 'externalId'],
        })
      }
    })
    if (
      value.provider === 'cses' &&
      ConnectorOnlyProviderSchema.safeParse(value.provider).success &&
      !/^[0-9]{1,10}$/.test(value.account.handle)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A CSES account is identified by its numeric user ID.',
        path: ['account', 'handle'],
      })
    }
  })
export type ConnectorIngestRequest = z.infer<
  typeof ConnectorIngestRequestSchema
>

// Codeforces and CodeChef data is public and synced by the server; the
// connector reports which handle is signed in, which links and verifies the
// account and queues a server sync. CodeChef history is also uploaded
// through ingest.
export const ConnectorClaimProviderSchema = z.enum(['codeforces', 'codechef'])
export type ConnectorClaimProvider = z.infer<
  typeof ConnectorClaimProviderSchema
>

export const ConnectorClaimRequestSchema = z
  .object({
    provider: ConnectorClaimProviderSchema,
    handle: PublicProviderHandleSchema,
  })
  .strict()
export type ConnectorClaimRequest = z.infer<typeof ConnectorClaimRequestSchema>

export const ConnectorClaimResponseSchema = z
  .object({
    data: z
      .object({
        provider: ConnectorClaimProviderSchema,
        handle: PublicProviderHandleSchema,
        verified: z.boolean(),
        // False when a sync was requested recently (manual-sync cooldown).
        syncQueued: z.boolean(),
      })
      .strict(),
  })
  .strict()
export type ConnectorClaimResponse = z.infer<
  typeof ConnectorClaimResponseSchema
>

// A per-provider sync outcome, so failures are visible on the server. The
// message is written by the extension itself, never provider content.
export const ConnectorReportRequestSchema = z
  .object({
    provider: z.enum(['leetcode', 'cses', 'codeforces', 'codechef']),
    status: z.enum([
      'synced',
      'signed_out',
      'rate_limited',
      'unpaired',
      'error',
    ]),
    message: z.string().trim().max(300),
  })
  .strict()
export type ConnectorReportRequest = z.infer<
  typeof ConnectorReportRequestSchema
>

export const ConnectorIngestResponseSchema = z
  .object({
    data: z
      .object({
        provider: ConnectorProviderSchema,
        handle: PublicProviderHandleSchema,
        storedSubmissions: z.number().int().nonnegative(),
        storedSolvedProblems: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
export type ConnectorIngestResponse = z.infer<
  typeof ConnectorIngestResponseSchema
>
