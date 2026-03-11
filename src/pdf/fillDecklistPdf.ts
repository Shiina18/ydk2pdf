import fontkit from '@pdf-lib/fontkit'
import { PDFBool, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'

const templatePdfUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : '/') + '中文卡表模板.pdf'

let templateBytes: ArrayBuffer | null = null
let fontBytesCache: ArrayBuffer | null = null

export async function loadTemplatePdf(): Promise<ArrayBuffer> {
  if (templateBytes) return templateBytes
  const res = await fetch(templatePdfUrl)
  if (!res.ok) throw new Error('加载模板 PDF 失败，请刷新重试')
  templateBytes = await res.arrayBuffer()
  return templateBytes
}

/** 连接建立超时（拿到响应头为止） */
const FONT_CONNECTION_TIMEOUT_MS = 7000
/** 读 body 超时（大文件下载可较慢） */
const FONT_READ_BODY_TIMEOUT_MS = 60000

/**
 * 使用同一份模板副本，按 kvs（表单域名 → 值）填充 AcroForm，返回 PDF 字节。
 * @param opts.embedFont 是否内嵌字体（默认 true）；false 时仅写 /V + NeedAppearances，依赖阅读器字体
 */
export async function fillDecklistPdf(
  kvs: Record<string, string | number>,
  templateBuffer: ArrayBuffer,
  opts?: { embedFont?: boolean },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBuffer)
  pdfDoc.registerFontkit(fontkit)
  const form = pdfDoc.getForm()

  const baseUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/') || '/'
  const fontPath = `${baseUrl}fonts/SourceHanSans-Regular.otf`
  const embedFont = opts?.embedFont !== false

  let embeddedFont:
    | import('pdf-lib').PDFFont
    | null = null

  // 仅当选择内嵌字体且尚未缓存时，才请求字体
  if (embedFont && !fontBytesCache) {
    try {
      if (typeof document !== 'undefined') {
        const msgEl = document.querySelector<HTMLParagraphElement>('#message')
        if (msgEl) {
          msgEl.textContent = '首次使用需要下载字体（约 10+ MB），请耐心等待…'
        }
      }

      const controller =
        typeof AbortController !== 'undefined'
          ? new AbortController()
          : undefined
      let connTimeoutId: ReturnType<typeof setTimeout> | undefined
      let readTimeoutId: ReturnType<typeof setTimeout> | undefined

      const connTimeoutPromise = new Promise<never>((_, reject) => {
        connTimeoutId = setTimeout(
          () => {
            controller?.abort()
            reject(new Error('字体连接超时'))
          },
          FONT_CONNECTION_TIMEOUT_MS,
        )
      })

      const res = await Promise.race([
        connTimeoutPromise,
        fetch(fontPath, { signal: controller?.signal }),
      ])
      if (connTimeoutId !== undefined) clearTimeout(connTimeoutId)
      if (!res.ok) {
        throw new Error(`加载字体失败: ${fontPath}`)
      }

      const readTimeoutPromise = new Promise<never>((_, reject) => {
        readTimeoutId = setTimeout(
          () => {
            controller?.abort()
            reject(new Error('字体下载超时'))
          },
          FONT_READ_BODY_TIMEOUT_MS,
        )
      })

      const buf = await Promise.race([
        readTimeoutPromise,
        res.arrayBuffer(),
      ])
      if (readTimeoutId !== undefined) clearTimeout(readTimeoutId)
      fontBytesCache = buf

      if (typeof document !== 'undefined') {
        const successEl =
          document.querySelector<HTMLParagraphElement>('#font-success')
        if (successEl) {
          successEl.hidden = false
          successEl.textContent = '字体已加载，后续生成将更快。'
        }
      }
    } catch {
      fontBytesCache = null
      if (typeof document !== 'undefined') {
        const warnEl =
          document.querySelector<HTMLParagraphElement>('#font-warning')
        if (warnEl) {
          warnEl.hidden = false
          warnEl.textContent =
            '字体下载失败：已退回系统字体显示，部分文字可能无法正常显示。'
        }
      }
    }
  }

  if (embedFont && fontBytesCache) {
    embeddedFont = await pdfDoc.embedFont(fontBytesCache, { subset: true })
  }

  // 让 PDF 阅读器根据字段值 /V 自动渲染（作为兜底）
  try {
    const acroForm = pdfDoc.catalog.getOrCreateAcroForm()
    if (typeof (acroForm as unknown as { set?: unknown }).set === 'function') {
      ;(acroForm as unknown as { set: (k: unknown, v: unknown) => void }).set(
        PDFName.of('NeedAppearances'),
        PDFBool.True,
      )
    } else if (
      typeof (acroForm as unknown as { dict?: unknown }).dict === 'object' &&
      typeof (acroForm as unknown as { dict: { set: (k: unknown, v: unknown) => void } }).dict
        .set === 'function'
    ) {
      ;(acroForm as unknown as { dict: { set: (k: unknown, v: unknown) => void } }).dict.set(
        PDFName.of('NeedAppearances'),
        PDFBool.True,
      )
    }
  } catch {
    // ignore
  }

  for (const [fieldName, value] of Object.entries(kvs)) {
    try {
      const field = form.getField(fieldName) as unknown as {
        acroField?: { dict?: { set: (k: unknown, v: unknown) => void } }
      }
      const dict = field.acroField?.dict
      if (!dict) continue
      dict.set(PDFName.of('V'), PDFHexString.fromText(String(value)))
    } catch {
      // 忽略不存在的域
    }
  }

  // 用嵌入字体生成外观流，避免依赖用户电脑字体；若未成功嵌入，则直接依赖 NeedAppearances + 阅读器本地字体。
  if (embeddedFont) {
    try {
      form.updateFieldAppearances(embeddedFont)
    } catch {
      // ignore: 若模板字段异常，至少保留 /V + NeedAppearances
    }
  }

  return pdfDoc.save({ updateFieldAppearances: false })
}
