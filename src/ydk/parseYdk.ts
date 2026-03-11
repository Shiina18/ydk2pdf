export interface SectionDeck {
  main: string[]
  extra: string[]
  side: string[]
}

const SECTION_MAIN = '#main'
const SECTION_EXTRA = '#extra'
const SECTION_SIDE = '!side'

/**
 * 将原始 YDK 文本解析为主卡组 / 额外 / 副卡组。
 * 卡号以字符串保留，前导零（如 "03739500"）不丢失。
 */
export function parseYdk(text: string): SectionDeck {
  const lines = text.split(/\r?\n/)
  const main: string[] = []
  const extra: string[] = []
  const side: string[] = []
  let current: string[] | null = null

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
    if (!/^\d+$/.test(trimmed)) continue
    current.push(trimmed)
  }
  return { main, extra, side }
}

/** 将主/额外/副卡组合并成卡号列表（字符串），保持顺序与重复。 */
export function sectionDeckToCardIds(deck: SectionDeck): string[] {
  return [...deck.main, ...deck.extra, ...deck.side]
}
