import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { useNotification } from '@/app/useNotification'
import { Button } from '@/components/ui/button'

import {
  useDeleteAllData,
  useDeleteAllDataStatus,
} from '../hooks/useLearnerSettings'

type DataResetDialogProps = {
  open: boolean
  onClose: () => void
}

export function DataResetDialog({ open, onClose }: DataResetDialogProps) {
  if (!open) return null

  return <DataResetDialogContent onClose={onClose} />
}

function DataResetDialogContent({
  onClose,
}: Pick<DataResetDialogProps, 'onClose'>) {
  const navigate = useNavigate()
  const { notify } = useNotification()
  const deleteMutation = useDeleteAllData()
  const queryClient = useQueryClient()
  const dialogId = useId()
  const [confirmation, setConfirmation] = useState('')
  const [waitingForCleanup, setWaitingForCleanup] = useState(false)
  const statusQuery = useDeleteAllDataStatus(waitingForCleanup)
  const cleanupFailed = statusQuery.data?.data.status === 'failed'
  const isBusy = deleteMutation.isPending || waitingForCleanup
  const handledResetCompletion = useRef(false)

  useEffect(() => {
    if (
      !waitingForCleanup ||
      handledResetCompletion.current ||
      statusQuery.isFetching ||
      statusQuery.data?.data.status !== 'completed'
    ) {
      return
    }

    handledResetCompletion.current = true
    queryClient.clear()
    notify({
      title: 'AlgoMemtor data reset complete',
      description:
        'Your AlgoMemtor data has been removed. You can start onboarding again.',
      tone: 'success',
    })
    onClose()
    void navigate('/onboarding', { replace: true })
  }, [
    navigate,
    notify,
    onClose,
    queryClient,
    statusQuery.data?.data.status,
    statusQuery.isFetching,
    waitingForCleanup,
  ])

  function close() {
    if (isBusy) return
    setConfirmation('')
    onClose()
  }

  async function resetData() {
    if (confirmation !== 'DELETE' || isBusy) return
    try {
      await deleteMutation.mutateAsync({
        confirmation: 'DELETE',
      })
      setConfirmation('')
      setWaitingForCleanup(true)
    } catch (error) {
      notify({
        title: 'Data reset was not requested',
        description:
          error instanceof Error ? error.message : 'Please try again shortly.',
        tone: 'error',
      })
    }
  }

  async function retryCleanup() {
    if (deleteMutation.isPending || !cleanupFailed) return
    try {
      await deleteMutation.mutateAsync({ confirmation: 'DELETE' })
      await statusQuery.refetch()
    } catch (error) {
      notify({
        title: 'Cleanup retry was not requested',
        description:
          error instanceof Error ? error.message : 'Please try again shortly.',
        tone: 'error',
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        aria-describedby={`${dialogId}-description`}
        aria-labelledby={`${dialogId}-title`}
        aria-modal="true"
        className="w-full max-w-lg rounded-t-2xl border border-destructive/40 bg-background p-5 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !isBusy) close()
        }}
        role="dialog"
        tabIndex={-1}
      >
        <h2
          className="text-xl font-semibold text-foreground"
          id={`${dialogId}-title`}
        >
          {waitingForCleanup && !cleanupFailed
            ? 'Finishing your data reset…'
            : cleanupFailed
              ? 'Data reset needs a retry'
              : 'Reset AlgoMemtor data?'}
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-muted-foreground"
          id={`${dialogId}-description`}
        >
          {waitingForCleanup && !cleanupFailed
            ? 'Your reset request was accepted. We are waiting for background cleanup to finish before opening onboarding. Your Supabase sign-in account is kept.'
            : cleanupFailed
              ? 'Background cleanup did not finish. Your learner data remains hidden until cleanup succeeds. Retry the cleanup to continue. Your Supabase sign-in account is kept.'
              : 'This removes your learner profile, bookmarks, statuses, reflections, timers, recommendation history, feedback, and AI memory data. Your Supabase sign-in account is kept. The request may finish in the background.'}
        </p>
        {waitingForCleanup ? (
          <div
            className="mt-5 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            role={statusQuery.isError ? 'alert' : 'status'}
          >
            {statusQuery.isError
              ? 'We could not check the cleanup status right now.'
              : cleanupFailed
                ? 'Cleanup failed. Retry the background cleanup to continue.'
                : statusQuery.isFetching
                  ? 'Checking the cleanup status…'
                  : 'Cleanup is still in progress. We will keep checking automatically.'}
          </div>
        ) : (
          <>
            <label
              className="mt-5 block space-y-1.5 text-sm font-medium text-foreground"
              htmlFor={`${dialogId}-confirmation`}
            >
              Type DELETE to confirm
              <input
                autoComplete="off"
                className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                disabled={isBusy}
                id={`${dialogId}-confirmation`}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                value={confirmation}
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button
                disabled={isBusy}
                onClick={close}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={confirmation !== 'DELETE' || isBusy}
                onClick={() => void resetData()}
                type="button"
                variant="destructive"
              >
                {deleteMutation.isPending
                  ? 'Requesting reset…'
                  : 'Reset my data'}
              </Button>
            </div>
          </>
        )}
        {waitingForCleanup && (statusQuery.isError || cleanupFailed) ? (
          <div className="mt-5 flex justify-end border-t border-border pt-4">
            <Button
              disabled={statusQuery.isFetching || deleteMutation.isPending}
              onClick={() =>
                void (cleanupFailed ? retryCleanup() : statusQuery.refetch())
              }
              type="button"
              variant="outline"
            >
              {deleteMutation.isPending
                ? 'Retrying…'
                : statusQuery.isFetching
                  ? 'Checking…'
                  : cleanupFailed
                    ? 'Retry cleanup'
                    : 'Check again'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
