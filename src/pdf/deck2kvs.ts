import type { Deck, DeckRecord, CardLanguage } from '../types/card'

/** adapter: 逻辑名 → PDF 表单域名 */
export type AdapterMap = Record<string, string>

const MAX_MAIN_ROWS = 20
const MAX_EXTRA_ROWS = 15
const MAX_SIDE_ROWS = 15

function getName(record: DeckRecord, lang: CardLanguage): string {
  switch (lang) {
    case 'sc': {
      // 简中缺失时回退中文旧译，并标注以区分
      if (record.name_sc && record.name_sc.trim()) return record.name_sc
      return `${record.name_cn} (旧译)`
    }
    case 'jp':
      return record.name_jp && record.name_jp.trim() ? record.name_jp : record.name_cn
    case 'cn':
      return record.name_cn
    case 'en':
      return record.name_en && record.name_en.trim() ? record.name_en : record.name_cn
  }
}

export interface Deck2KvsResult {
  kvs: Record<string, string | number>
  overflow: { Monster?: DeckRecord[]; Spell?: DeckRecord[]; Trap?: DeckRecord[]; Unknown?: DeckRecord[] }
}

/**
 * 按 ydk2decklist 规则：主卡组怪兽→魔法→陷阱，每类最多 20 行；额外/副各 15 行。
 * 输出 key 为 PDF 表单域名（adapter 的 value），value 为要填写的值。
 */
export function deck2kvs(
  deck: Deck,
  adapter: AdapterMap,
  lang: CardLanguage,
  fillMonsterInSpell: boolean,
): Deck2KvsResult {
  const kvs: Record<string, string | number> = {}
  const mainTypeIdx: Record<string, number> = { Monster: 0, Spell: 0, Trap: 0 }
  const mainTypeCount: Record<string, number> = { Monster: 0, Spell: 0, Trap: 0 }
  const mainTypeOverflow: Deck2KvsResult['overflow'] = {
    Monster: [],
    Spell: [],
    Trap: [],
    Unknown: [],
  }

  for (const record of deck.main) {
    const cardType = record.type
    if (cardType === null) {
      mainTypeOverflow.Unknown!.push(record)
      continue
    }
    mainTypeIdx[cardType] += 1
    const idx = mainTypeIdx[cardType]
    mainTypeCount[cardType] += record.count
    const fieldName = adapter[`${cardType} ${idx}`]
    const countField = adapter[`${cardType} Card ${idx} Count`]
    if (idx <= MAX_MAIN_ROWS && fieldName) {
      kvs[fieldName] = getName(record, lang)
      if (countField) kvs[countField] = record.count
    }
    if (idx > MAX_MAIN_ROWS) {
      if (!mainTypeOverflow[cardType]) mainTypeOverflow[cardType] = []
      mainTypeOverflow[cardType]!.push(record)
    }
  }

  kvs[adapter['Total Monster Cards']] = mainTypeCount.Monster
  kvs[adapter['Total Spell Cards']] = mainTypeCount.Spell
  kvs[adapter['Total Trap Cards']] = mainTypeCount.Trap
  kvs[adapter['Main Deck Total']] =
    mainTypeCount.Monster + mainTypeCount.Spell + mainTypeCount.Trap

  if (fillMonsterInSpell && mainTypeOverflow.Monster?.length) {
    const monsterOverflow = mainTypeOverflow.Monster
    let numFilled = 0
    const numSpells = mainTypeIdx.Spell
    for (let i = 0; i < monsterOverflow.length; i++) {
      if (i + numSpells + 2 >= MAX_MAIN_ROWS) break
      numFilled++
      const record = monsterOverflow[monsterOverflow.length - 1 - i]
      const row = MAX_MAIN_ROWS - i
      const fieldName = adapter[`Spell ${row}`]
      const countField = adapter[`Spell Card ${row} Count`]
      if (fieldName) kvs[fieldName] = getName(record, lang)
      if (countField) kvs[countField] = record.count
    }
    if (numFilled > 0) {
      const sepRow = MAX_MAIN_ROWS - numFilled
      const sepField = adapter[`Spell ${sepRow}`]
      if (sepField) kvs[sepField] = '===以下怪兽===以上魔法==='
    }
  }

  let extraCount = 0
  deck.extra.slice(0, MAX_EXTRA_ROWS).forEach((record, i) => {
    const idx = i + 1
    const fieldName = adapter[`Extra Deck ${idx}`]
    const countField = adapter[`Extra Deck ${idx} Count`]
    if (fieldName) kvs[fieldName] = getName(record, lang)
    if (countField) kvs[countField] = record.count
    extraCount += record.count
  })
  kvs[adapter['Total Extra Deck']] = extraCount
  kvs[adapter['Extra Deck Total']] = extraCount

  let sideCount = 0
  deck.side.slice(0, MAX_SIDE_ROWS).forEach((record, i) => {
    const idx = i + 1
    const fieldName = adapter[`Side Deck ${idx}`]
    const countField = adapter[`Side Deck ${idx} Count`]
    if (fieldName) kvs[fieldName] = getName(record, lang)
    if (countField) kvs[countField] = record.count
    sideCount += record.count
  })
  kvs[adapter['Total Side Deck']] = sideCount
  kvs[adapter['Side Deck Total']] = sideCount

  return { kvs, overflow: mainTypeOverflow }
}
