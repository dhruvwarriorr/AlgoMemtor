// Identical reads that are in flight at the same moment share one database
// query. A coach turn builds its context, rebuilds the roadmap and computes
// analytics concurrently, and each asks for the same submissions, solves,
// actions and profile; without this every list crosses to the database
// several times per turn. Only overlapping calls are merged, so no result
// outlives its query and nothing can be served stale.
export function dedupeConcurrentReads<T extends object>(
  target: T,
  methods: readonly (keyof T & string)[],
): T {
  const inFlight = new Map<string, Promise<unknown>>()
  const shared = new Set<string>(methods)

  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver)
      if (
        typeof property !== 'string' ||
        !shared.has(property) ||
        typeof value !== 'function'
      ) {
        return value
      }
      return (...args: unknown[]) => {
        // `list(id)` and `list(id, undefined)` are the same read.
        let length = args.length
        while (length > 0 && args[length - 1] === undefined) length -= 1
        const key = `${property}:${JSON.stringify(args.slice(0, length))}`
        let pending = inFlight.get(key)
        if (pending === undefined) {
          pending = Promise.resolve(
            (value as (...input: unknown[]) => unknown).apply(object, args),
          ).finally(() => inFlight.delete(key))
          inFlight.set(key, pending)
        }
        // Callers may sort or filter what they get; each gets its own array.
        return pending.then((result) =>
          Array.isArray(result) ? [...result] : result,
        )
      }
    },
  })
}
