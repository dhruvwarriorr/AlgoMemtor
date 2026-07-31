import { useEffect, useState, type PropsWithChildren } from 'react'

const shouldEnableMocks =
  import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true'

let startupPromise: Promise<unknown> | undefined

function startMockWorker() {
  startupPromise ??= import('@/mocks/browser').then(({ worker }) =>
    worker.start({ onUnhandledRequest: 'bypass' }),
  )

  return startupPromise
}

export function DevelopmentMocks({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(!shouldEnableMocks)

  useEffect(() => {
    if (!shouldEnableMocks) {
      return
    }

    let isMounted = true

    void startMockWorker()
      .catch((error: unknown) => {
        console.error('Unable to start development API mocks.', error)
      })
      .finally(() => {
        if (isMounted) {
          setIsReady(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (!isReady) {
    return (
      <p className="p-4" role="status">
        Starting development services…
      </p>
    )
  }

  return children
}
