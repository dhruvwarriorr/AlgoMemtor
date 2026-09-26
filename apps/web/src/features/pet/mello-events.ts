// Lets the rest of the app tell Mello about a success without knowing
// whether Mello is shown.
type Listener = () => void

const listeners = new Set<Listener>()

export function cueMelloSuccess() {
  for (const listener of listeners) listener()
}

export function onMelloSuccess(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
