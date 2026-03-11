/** idChangelog 键可能为 "03739500" 或 "3739500"，值为新卡号（数字）；归一化后为新卡号 8 位字符串或原 id。 */
function lookupId(id: string, idChangelog: Record<string, number>): string {
  const key8 = id.padStart(8, '0')
  const key = id.replace(/^0+/, '') || '0'
  const newId = idChangelog[id] ?? idChangelog[key8] ?? idChangelog[key]
  if (newId !== undefined) return String(newId).padStart(8, '0')
  return id
}

export function normalizeCardIds(
  cardIds: string[],
  idChangelog: Record<string, number>,
): string[] {
  return cardIds.map((id) => lookupId(id, idChangelog))
}
