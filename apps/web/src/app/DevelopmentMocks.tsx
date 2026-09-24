import { useEffect, useState, type PropsWithChildren } from 'react'

import { OrbLoader } from '@/components/motion/OrbLoader'

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
      <div className="grid min-h-svh place-items-center p-4" role="status">
        <OrbLoader label="Starting development services…" />
      </div>
    )
  }

  return children
}
