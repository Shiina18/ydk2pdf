import type { SectionDeck } from '../ydk/parseYdk'
import type { Deck, DeckRecord } from '../types/card'
import { normalizeCardIds } from '../utils/normalizeCardId'
import { cachedFetchCardInfo } from '../api/cardApi'

const PLACEHOLDER = (cardId: number) => `(卡号 ${cardId} 未找到)`

/**
 * 从 SectionDeck + idChangelog 归一化卡号，请求 API 获取每张卡的类型与多语种名，
 * 按原顺序与数量组装成 Deck（main/extra/side 各为 DeckRecord[]）。
 *
 * 可选 onProgress 回调用于进度展示（done/total 基于去重后的卡号个数）。
 */
export async function buildDeck(
  sectionDeck: SectionDeck,
  idChangelog: Record<string, number>,
  onProgress?: (p: { done: number; total: number }) => void,
): Promise<{
  deck: Deck
  notFoundIds: number[]
}> {
  const notFoundIds: number[] = []
  const normMain = normalizeCardIds(sectionDeck.main, idChangelog)
  const normExtra = normalizeCardIds(sectionDeck.extra, idChangelog)
  const normSide = normalizeCardIds(sectionDeck.side, idChangelog)
  const uniqueMain = [...new Set(normMain)]
  const uniqueExtra = [...new Set(normExtra)]
  const uniqueSide = [...new Set(normSide)]

  const totalUnique = uniqueMain.length + uniqueExtra.length + uniqueSide.length
  let done = 0

  const fetchAll = async (ids: number[]) => {
    const promises = ids.map((id) =>
      cachedFetchCardInfo(id).then((info) => {
        done += 1
        if (onProgress && totalUnique > 0) {
          onProgress({ done, total: totalUnique })
        }
        return info
      }),
    )
    const results = await Promise.all(promises)
    const map = new Map<number, import('../types/card').CardInfo | null>()
    ids.forEach((id, i) => {
      map.set(id, results[i] ?? null)
      if (!results[i]) notFoundIds.push(id)
    })
    return map
  }

  const [mainInfos, extraInfos, sideInfos] = await Promise.all([
    fetchAll(uniqueMain),
    fetchAll(uniqueExtra),
    fetchAll(uniqueSide),
  ])

  const toRecords = (
    normIds: number[],
    infos: Map<number, import('../types/card').CardInfo | null>,
  ): DeckRecord[] => {
    const countMap = new Map<number, number>()
    for (const id of normIds) {
      countMap.set(id, (countMap.get(id) ?? 0) + 1)
    }
    const result: DeckRecord[] = []
    const seen = new Set<number>()
    for (const id of normIds) {
      if (seen.has(id)) continue
      seen.add(id)
      const info = infos.get(id) ?? null
      const count = countMap.get(id) ?? 1
      result.push({
        card_id: id,
        count,
        type: info?.type ?? null,
        name_jp: info?.name_jp ?? PLACEHOLDER(id),
        name_cn: info?.name_cn ?? PLACEHOLDER(id),
        name_sc: info?.name_sc ?? null,
        name_en: info?.name_en ?? PLACEHOLDER(id),
      })
    }
    return result
  }

  const deck: Deck = {
    main: toRecords(normMain, mainInfos),
    extra: toRecords(normExtra, extraInfos),
    side: toRecords(normSide, sideInfos),
  }
  return { deck, notFoundIds: [...new Set(notFoundIds)] }
}
