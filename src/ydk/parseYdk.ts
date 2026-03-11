export interface SectionDeck {
  main: number[]
  extra: number[]
  side: number[]
}

const SECTION_MAIN = '#main'
const SECTION_EXTRA = '#extra'
const SECTION_SIDE = '!side'

/**
 * 将原始 YDK 文本解析为主卡组 / 额外 / 副卡组。
 */
export function parseYdk(text: string): SectionDeck {
  const lines = text.split(/\r?\n/)
  const main: number[] = []
  const extra: number[] = []
  const side: number[] = []
  let current: number[] | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === SECTION_MAIN) {
      current = main
      continue
    }
    if (trimmed === SECTION_EXTRA) {
      current = extra
      continue
    }
    if (trimmed === SECTION_SIDE) {
      current = side
      continue
    }
    if (current === null) continue
    const num = Number(trimmed)
    if (Number.isInteger(num) && String(num) === trimmed) {
      current.push(num)
    }
  }
  return { main, extra, side }
}

/** 将主/额外/副卡组合并成卡号列表，保持顺序与重复。 */
export function sectionDeckToCardIds(deck: SectionDeck): number[] {
  return [...deck.main, ...deck.extra, ...deck.side]
}
