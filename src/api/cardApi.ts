import type { CardInfo, CardType } from '../types/card'

const API_BASE = 'https://ygocdb.com/api/v0'

/**
 * 从 data.type 按位解析怪兽/魔法/陷阱，与 ydk2decklist utils.parse_type 一致。
 * https://github.com/KittyTrouble/Ygopro-Card-Creation#step-4b-choosing-a-cards-type
 */
function parseType(typeNum: number): CardType {
  const binary = typeNum.toString(2)
  if (binary[binary.length - 1] === '1') return 'Monster'
  if (binary[binary.length - 2] === '1') return 'Spell'
  if (binary[binary.length - 3] === '1') return 'Trap'
  return 'Monster'
}

interface SearchResultItem {
  id: number
  data?: { type?: number }
  cn_name?: string
  sc_name?: string
  jp_name?: string
  en_name?: string
}

interface SearchResponse {
  result?: SearchResultItem[]
}

/**
 * 请求 ygocdb 搜索接口获取单卡信息。cardId 是字符串，给什么用什么，直接拼进 URL。
 */
export async function fetchCardInfo(cardId: string): Promise<CardInfo | null> {
  const url = `${API_BASE}/?search=${cardId}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data: SearchResponse = await res.json()
    const list = data.result
    if (!list || list.length === 0) return null
    const item = list[0]
    const typeNum = item.data?.type ?? 0
    return {
      type: parseType(typeNum),
      name_jp: item.jp_name ?? `(卡号 ${cardId} 未找到日文名)`,
      name_cn: item.cn_name ?? `(卡号 ${cardId} 未找到中文名)`,
      name_sc: item.sc_name ?? null,
      name_en: item.en_name ?? `(卡号 ${cardId} 未找到英文名)`,
    }
  } catch {
    return null
  }
}

const cardCache = new Map<string, Promise<CardInfo | null>>()

/** 带缓存的拉取，同一卡号（字符串）只请求一次 */
export function cachedFetchCardInfo(cardId: string): Promise<CardInfo | null> {
  let p = cardCache.get(cardId)
  if (!p) {
    p = fetchCardInfo(cardId)
    cardCache.set(cardId, p)
  }
  return p
}
