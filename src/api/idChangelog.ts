let cached: Promise<Record<string, number>> | null = null

const idChangelogUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : '/') + 'idChangelog.json'

export function fetchIdChangelog(): Promise<Record<string, number>> {
  if (cached) return cached
  cached = fetch(idChangelogUrl)
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}))
  return cached
}
