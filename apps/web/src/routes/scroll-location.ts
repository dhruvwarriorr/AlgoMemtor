const storagePrefix = 'algomemtor:scroll:'

export function scrollLocationKey({
  hash,
  pathname,
  search,
}: {
  hash: string
  pathname: string
  search: string
}) {
  return `${storagePrefix}${pathname}${search}${hash}`
}
