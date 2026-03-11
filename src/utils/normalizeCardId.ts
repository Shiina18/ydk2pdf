export function normalizeCardIds(
  cardIds: number[],
  idChangelog: Record<string, number>,
): number[] {
  return cardIds.map((id) => idChangelog[String(id)] ?? id)
}
