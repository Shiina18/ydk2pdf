/** 卡号就是字符串：用传入的 id 直接查 idChangelog，有则用新号（转字符串），没有则原样返回。 */
function lookupId(id: string, idChangelog: Record<string, number>): string {
  const newId = idChangelog[id]
  if (newId !== undefined) return String(newId)
  return id
}

export function normalizeCardIds(
  cardIds: string[],
  idChangelog: Record<string, number>,
): string[] {
  return cardIds.map((id) => lookupId(id, idChangelog))
}
