// A friendly first name derived from the sign-in email, e.g. "dhruv.k@…" -> "Dhruv k".
export function displayNameFromEmail(email: string | undefined | null) {
  const local = email?.split('@')[0] ?? ''
  const name = local
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, '')
    .trim()
  if (!name) return 'there'
  return name.charAt(0).toUpperCase() + name.slice(1)
}
