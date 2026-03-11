/** 卡类型：怪兽 / 魔法 / 陷阱，与 ydk2decklist parse_type 一致 */
export type CardType = 'Monster' | 'Spell' | 'Trap'

/** 多语种卡名 */
export interface CardNames {
  name_jp: string
  /** 中文旧译（cn_name） */
  name_cn: string
  /** 简中（sc_name），可能为空 */
  name_sc: string | null
  name_en: string
}

export interface CardInfo extends CardNames {
  type: CardType
}

/** 卡组中的单条记录（含卡号、数量、类型、多语种名）。卡号为字符串以保留前导零。 */
export interface DeckRecord {
  card_id: string
  count: number
  type: CardType | null
  name_jp: string
  /** 中文旧译（cn_name） */
  name_cn: string
  /** 简中（sc_name），可能为空 */
  name_sc: string | null
  name_en: string
  /** 是否成功从接口获取到卡片信息（用于区分未找到占位 vs 有效旧译） */
  resolved: boolean
}

/** 按主/额外/副分区的卡组 */
export interface Deck {
  main: DeckRecord[]
  extra: DeckRecord[]
  side: DeckRecord[]
}

export type CardLanguage = 'sc' | 'jp' | 'cn' | 'en'
