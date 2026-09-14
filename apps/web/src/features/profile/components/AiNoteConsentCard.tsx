import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'

import { useAiConsent, useSaveAiConsent } from '../hooks/useLearnerSettings'

export const AI_POLICY_VERSION = 'phase9-progress-memory-v1'

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
        title: 'AI note-sharing choice saved',
        description: decision
          ? 'Current and eligible historical reflection notes may now be processed by Gemini for learner-memory suggestions.'
          : 'Your reflection-note text will not be sent to Gemini; structured progress signals may still be processed separately.',
        tone: 'success',
      })
    } catch (error) {
      notify({
        title: 'AI note-sharing choice was not saved',
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
            Choose whether to share learning notes with AI
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Reflection-note text is shared only when you explicitly choose to
            allow it and save that choice. If enabled, the free-form text of
            your reflection notes, including eligible retained historical notes,
            is sent to Google Gemini to propose learner memories. Structured
            progress signals such as status, reported difficulty, time spent,
            and recommendation feedback may be processed separately. AlgoMemtor
            does not send provider problem statements, source code, passwords,
            or credentials. You can change this choice later; disabling it stops
            new reflection-note sharing and removes note-derived memory data.
          </p>
        </div>
        {existingUser ? (
          <Button
            aria-label="Dismiss AI note-sharing prompt"
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
          Loading your note-sharing choice…
        </p>
      ) : consentQuery.isError ? (
        <div
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <p>We could not load your current choice.</p>
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
            <legend className="sr-only">AI note-sharing choice</legend>
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
                  Allow reflection-note sharing with Gemini
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Send current and eligible retained reflection notes to Gemini
                  for proposed learner memories. You can review, correct,
                  archive, or delete them.
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
                  Keep reflection notes private from Gemini
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Do not send reflection-note text to Gemini. Structured
                  progress signals may still be processed separately for
                  learner-memory suggestions.
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
