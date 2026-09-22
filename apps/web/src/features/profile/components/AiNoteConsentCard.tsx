import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'

import { useAiConsent, useSaveAiConsent } from '../hooks/useLearnerSettings'

export const AI_POLICY_VERSION = 'personalized-coaching-rag-v2'

type AiNoteConsentCardProps = {
  existingUser?: boolean
}

export function AiNoteConsentCard({
  existingUser = false,
}: AiNoteConsentCardProps) {
  const consentQuery = useAiConsent()
  const saveMutation = useSaveAiConsent()
  const { notify } = useNotification()
  const groupId = useId()
  const [decisionOverride, setDecisionOverride] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const serverDecision = consentQuery.data?.data?.enabled ?? null
  const decision = decisionOverride ?? serverDecision

  async function save() {
    if (decision === null) return
    try {
      await saveMutation.mutateAsync({
        enabled: decision,
        policyVersion: AI_POLICY_VERSION,
      })
      notify({
        title: 'Personalized AI coaching choice saved',
        description: decision
          ? 'Your bounded learner context and eligible reflection notes may now be processed by Gemini for personalized coaching and learner-memory suggestions.'
          : 'Personalized coaching, check-ins, and learner-memory processing are disabled until you choose to enable them again.',
        tone: 'success',
      })
    } catch (error) {
      notify({
        title: 'Personalized AI coaching choice was not saved',
        description:
          error instanceof Error ? error.message : 'Please try again shortly.',
        tone: 'error',
      })
    }
  }

  if (dismissed) return null

  return (
    <section
      aria-labelledby={`${groupId}-heading`}
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-lg font-semibold text-card-foreground"
            id={`${groupId}-heading`}
          >
            Choose whether to enable personalized AI coaching and learner memory
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Reflection-note text is shared only when you explicitly choose to
            allow it and save that choice. If enabled, the free-form text of
            your reflection notes, including eligible retained historical notes,
            may be sent to Google Gemini for personalized CP/DSA coaching and
            controlled learner-memory suggestions. Structured progress signals
            such as your profile, roadmap, status, reported difficulty, time
            spent, provider activity, contests, and recommendation feedback may
            be processed to ground coaching and learner-memory suggestions. When
            disabled, these signals stay in AlgoMemtor for deterministic
            features and no retained learner context is sent to Gemini. When a
            question needs current public CP/DSA information, a de-identified
            search query may be sent for grounded sources; your profile,
            handles, ratings, and private history are not included in that
            search request. Search sources are shown in the answer, and direct
            public problem pages may be offered as web-grounded practice links.
            Images, documents, audio, or video you choose to attach to a coach
            question are sent to Gemini for that answer and are not saved in
            your chat history. AlgoMemtor does not automatically send provider
            problem statements or source code, and never sends passwords or
            credentials. You can change this choice later; disabling it stops
            new AI coaching and check-ins, removes derived
            summaries/embeddings/memories, and keeps your safe chats and roadmap
            until you delete them.
          </p>
        </div>
        {existingUser ? (
          <Button
            aria-label="Dismiss personalized AI coaching prompt"
            onClick={() => setDismissed(true)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            ×
          </Button>
        ) : null}
      </div>

      {consentQuery.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading your personalized AI coaching choice…
        </p>
      ) : consentQuery.isError ? (
        <div
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <p>We could not load your current personalized coaching choice.</p>
          <Button
            className="mt-3"
            onClick={() => void consentQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <fieldset
            className="mt-4 space-y-3"
            disabled={saveMutation.isPending}
          >
            <legend className="sr-only">Personalized AI coaching choice</legend>
            <label className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground">
              <input
                checked={decision === true}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                name={`${groupId}-decision`}
                onChange={() => setDecisionOverride(true)}
                type="radio"
              />
              <span>
                <span className="block font-medium">
                  Enable personalized coaching and learner memory
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Allow the coach to use your bounded learner context and
                  eligible reflection notes. You can review, correct, archive,
                  or delete learner memories.
                </span>
              </span>
            </label>
            <label className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground">
              <input
                checked={decision === false}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                name={`${groupId}-decision`}
                onChange={() => setDecisionOverride(false)}
                type="radio"
              />
              <span>
                <span className="block font-medium">
                  Keep personalized AI coaching disabled
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Do not send learner context or reflection-note text to Gemini.
                  Existing safe chats and roadmap data remain visible to you.
                </span>
              </span>
            </label>
          </fieldset>
          {decision === null ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              No choice is selected. This prompt does not block the rest of the
              app.
            </p>
          ) : null}
          {decision === true ? (
            <p className="mt-3 text-sm text-muted-foreground">
              This also applies to eligible historical notes that have not been
              processed yet.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              disabled={decision === null || saveMutation.isPending}
              onClick={() => void save()}
              type="button"
            >
              {saveMutation.isPending ? 'Saving choice…' : 'Save choice'}
            </Button>
            {consentQuery.data?.data ? (
              <span className="text-xs text-muted-foreground">
                Current choice:{' '}
                {consentQuery.data.data.enabled ? 'share' : 'private'}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
