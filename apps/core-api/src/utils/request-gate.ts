export type RequestGateSleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>

export const sleepWithSignal: RequestGateSleep = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }

    const onAbort = () => {
      clearTimeout(timeout)
      reject(signal?.reason)
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)

    signal?.addEventListener('abort', onAbort, { once: true })
  })

export type RequestGateOptions = {
  minIntervalMs: number
  now?: () => number
  sleep?: RequestGateSleep
}

export class RequestGate {
  private readonly now: () => number
  private readonly sleep: RequestGateSleep
  private nextRequestAtMs = 0
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly options: RequestGateOptions) {
    if (!Number.isFinite(options.minIntervalMs) || options.minIntervalMs < 0) {
      throw new Error('The provider request interval is invalid.')
    }

    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? sleepWithSignal
  }

  async wait(signal?: AbortSignal) {
    let release = () => {}
    const previous = this.tail
    this.tail = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous

    try {
      if (signal?.aborted) {
        throw signal.reason
      }

      const waitMs = Math.max(0, this.nextRequestAtMs - this.now())

      if (waitMs > 0) {
        await this.sleep(waitMs, signal)
      }

      this.nextRequestAtMs = this.now() + this.options.minIntervalMs
    } finally {
      release()
    }
  }
}
