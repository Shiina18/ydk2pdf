import { parseYdk, sectionDeckToCardIds } from './ydk/parseYdk'
import { fetchIdChangelog } from './api/idChangelog'
import { buildDeck } from './decklist/buildDeck'
import { deck2kvs } from './pdf/deck2kvs'
import { loadTemplatePdf, fillDecklistPdf } from './pdf/fillDecklistPdf'
import type { CardLanguage } from './types/card'
import type { DeckRecord } from './types/card'
import appHtml from './app.html?raw'
import './style.css'

const LABEL_BY_LANG: Record<CardLanguage, string> = {
  sc: '简中',
  jp: '日文',
  cn: '中文旧译',
  en: '英文',
}

function getRequiredElement<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`缺少元素: ${selector}`)
  return el
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsText(file, 'utf-8')
  })
}

function renderDeckPreview(
  el: HTMLElement,
  sectionDeck: { main: number[]; extra: number[]; side: number[] },
) {
  const main = sectionDeck.main.length
  const extra = sectionDeck.extra.length
  const side = sectionDeck.side.length
  el.hidden = false
  el.innerHTML = `
    <p><strong>主卡组</strong> ${main} 张</p>
    <p><strong>额外卡组</strong> ${extra} 张</p>
    <p><strong>副卡组</strong> ${side} 张</p>
    <p>总计 ${main + extra + side} 张</p>
  `
}

function renderOverflow(
  overflow: { Monster?: DeckRecord[]; Spell?: DeckRecord[]; Trap?: DeckRecord[]; Unknown?: DeckRecord[] },
): string[] {
  const lines: string[] = []
  if (overflow.Monster?.length) {
    lines.push(`怪兽超过 20 种，多出 ${overflow.Monster.length} 种未写入 PDF`)
  }
  if (overflow.Spell?.length) {
    lines.push(`魔法超过 20 种，多出 ${overflow.Spell.length} 种未写入 PDF`)
  }
  if (overflow.Trap?.length) {
    lines.push(`陷阱超过 20 种，多出 ${overflow.Trap.length} 种未写入 PDF`)
  }
  if (overflow.Unknown?.length) {
    lines.push(`无法识别类型: ${overflow.Unknown.map((r) => r.card_id).join(', ')}`)
  }
  return lines
}

export function setupApp(root: HTMLDivElement) {
  root.innerHTML = appHtml

  const dropZone = getRequiredElement<HTMLDivElement>('#drop-zone', root)
  const fileInput = getRequiredElement<HTMLInputElement>('#file-input', root)
  const ydkText = getRequiredElement<HTMLTextAreaElement>('#ydk-text', root)
  const generateBtn = getRequiredElement<HTMLButtonElement>('#generate-btn', root)
  const messageEl = getRequiredElement<HTMLParagraphElement>('#message', root)
  const deckPreview = getRequiredElement<HTMLDivElement>('#deck-preview', root)
  const errorsEl = getRequiredElement<HTMLDivElement>('#errors', root)
  const languageRadios = root.querySelectorAll<HTMLInputElement>(
    'input[name="decklist-language"]',
  )

  let lastFileName: string | null = null
  let isGenerating = false
  let currentLanguage: CardLanguage = 'sc'

  languageRadios.forEach((radio) => {
    if (radio.checked) {
      currentLanguage = radio.value as CardLanguage
    }
    radio.addEventListener('change', () => {
      if (!radio.checked) return
      currentLanguage = radio.value as CardLanguage
    })
  })

  function setMessage(text: string) {
    messageEl.textContent = text
  }

  function showErrors(
    notFound: number[],
    overflowLines: string[],
  ) {
    if (notFound.length === 0 && overflowLines.length === 0) {
      errorsEl.hidden = true
      errorsEl.innerHTML = ''
      return
    }
    errorsEl.hidden = false
    const parts: string[] = []
    if (notFound.length) {
      parts.push(`以下卡号未找到: ${notFound.join(', ')}，PDF 中已留空或显示卡号。`)
    }
    parts.push(...overflowLines)
    errorsEl.innerHTML = `<p class="errors-title">${parts.join('</p><p>')}</p>`
  }

  function setGenerating(on: boolean) {
    isGenerating = on
    generateBtn.disabled = on
    generateBtn.textContent = on ? '生成中…' : '生成 PDF'
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  dropZone.addEventListener('click', () => fileInput.click())

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('dragover')
  })
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'))
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('dragover')
    const file = (e as DragEvent).dataTransfer?.files?.[0]
    if (!file || !file.name.toLowerCase().endsWith('.ydk')) {
      setMessage('请拖入 .ydk 文件')
      return
    }
    lastFileName = file.name
    readFileAsText(file).then(
      (text) => {
        ydkText.value = text
        setMessage('已读取文件')
        const deck = parseYdk(text)
        renderDeckPreview(deckPreview, deck)
      },
      (err) => setMessage(String(err instanceof Error ? err.message : err)),
    )
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    lastFileName = file.name
    readFileAsText(file).then(
      (text) => {
        ydkText.value = text
        setMessage('已读取文件')
        const deck = parseYdk(text)
        renderDeckPreview(deckPreview, deck)
      },
      (err) => setMessage(String(err instanceof Error ? err.message : err)),
    )
    fileInput.value = ''
  })

  ydkText.addEventListener('input', () => {
    lastFileName = null
    const text = ydkText.value.trim()
    if (text) {
      try {
        const deck = parseYdk(text)
        renderDeckPreview(deckPreview, deck)
      } catch {
        deckPreview.hidden = true
      }
    } else {
      deckPreview.hidden = true
    }
  })

  generateBtn.addEventListener('click', async () => {
    if (isGenerating) return
    const text = ydkText.value.trim()
    if (!text) {
      setMessage('请提供有效的 YDK 内容')
      return
    }

    let sectionDeck
    try {
      sectionDeck = parseYdk(text)
    } catch (e) {
      setMessage('无法解析 YDK，请检查格式')
      return
    }

    const cardIds = sectionDeckToCardIds(sectionDeck)
    if (cardIds.length === 0) {
      setMessage('未解析到任何卡号')
      return
    }

    setGenerating(true)
    showErrors([], [])

    try {
      const idChangelog = await fetchIdChangelog()
      const { deck, notFoundIds } = await buildDeck(
        sectionDeck,
        idChangelog,
        ({ done, total }) => {
          const percent = total > 0 ? Math.round((done / total) * 100) : 0
          setMessage(`生成中… (${percent}%)`)
        },
      )

      const adapterRes = await fetch(
        (import.meta.env.BASE_URL || '/') + 'adapter.json',
      )
      if (!adapterRes.ok) throw new Error('加载 adapter.json 失败')
      const adapter: Record<string, string> = await adapterRes.json()

      const templateBuffer = await loadTemplatePdf()
      // 进度条到 100% 之后，开始实际生成 PDF（首次加载字体可能稍慢）
      setMessage('生成 PDF 中…（首次加载字体可能稍慢）')
      let overflowLines: string[] = []
      const lang = currentLanguage
      const { kvs, overflow } = deck2kvs(deck, adapter, lang, true)
      overflowLines = renderOverflow(overflow)

      const pdfBytes = await fillDecklistPdf(kvs, templateBuffer)
      const stem = lastFileName ? lastFileName.replace(/\.ydk$/i, '') : 'deck'
      const label = LABEL_BY_LANG[lang]
      const filename = `${label}@${stem}.pdf`
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      downloadBlob(blob, filename)
      showErrors(notFoundIds, overflowLines)
      setMessage(`已生成 ${label} 卡表，已开始下载`)
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : '加载资源失败，请刷新重试',
      )
    } finally {
      setGenerating(false)
    }
  })
}

const appRoot = getRequiredElement<HTMLDivElement>('#app')
setupApp(appRoot)
