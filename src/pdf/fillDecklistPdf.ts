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
        const wrap = document.querySelector<HTMLElement>('#font-progress-wrap')
        const progressEl =
          document.querySelector<HTMLProgressElement>('#font-progress')
        if (wrap) wrap.hidden = false
        if (progressEl) {
          progressEl.value = 0
          progressEl.max = 100
        }
      }

      const res = await fetch(fontPath)
      if (!res.ok) {
        throw new Error(`加载字体失败: ${fontPath}`)
      }

      const total = res.headers.get('Content-Length')
        ? parseInt(res.headers.get('Content-Length')!, 10)
        : null

      const reader = res.body!.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      const msgEl =
        typeof document !== 'undefined'
          ? document.querySelector<HTMLParagraphElement>('#message')
          : null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        if (msgEl) {
            const mb = (loaded / 1024 / 1024).toFixed(1)
            msgEl.textContent =
              total != null
                ? `正在下载字体… ${mb} MB / ${(total / 1024 / 1024).toFixed(1)} MB (${Math.round((loaded / total) * 100)}%)`
                : `正在下载字体… ${mb} MB`
          }
          const progressEl =
            typeof document !== 'undefined'
              ? document.querySelector<HTMLProgressElement>('#font-progress')
              : null
          if (progressEl && total != null) {
            progressEl.value = Math.round((loaded / total) * 100)
            progressEl.max = 100
          }
      }
      reader.releaseLock()

      const out = new Uint8Array(loaded)
      let offset = 0
      for (const c of chunks) {
        out.set(c, offset)
        offset += c.length
      }
      const buf = out.buffer
      fontBytesCache = buf

      if (typeof document !== 'undefined') {
        const successEl =
          document.querySelector<HTMLParagraphElement>('#font-success')
        if (successEl) {
          successEl.hidden = false
          successEl.textContent = '字体已加载，后续生成将更快。'
        }
        const wrap = document.querySelector<HTMLElement>('#font-progress-wrap')
        if (wrap) wrap.hidden = true
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
        const wrap = document.querySelector<HTMLElement>('#font-progress-wrap')
        if (wrap) wrap.hidden = true
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
