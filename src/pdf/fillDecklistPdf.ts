import fontkit from '@pdf-lib/fontkit'
import { PDFBool, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'

const templatePdfUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : '/') + '中文卡表模板.pdf'

let templateBytes: ArrayBuffer | null = null

export async function loadTemplatePdf(): Promise<ArrayBuffer> {
  if (templateBytes) return templateBytes
  const res = await fetch(templatePdfUrl)
  if (!res.ok) throw new Error('加载模板 PDF 失败，请刷新重试')
  templateBytes = await res.arrayBuffer()
  return templateBytes
}

/**
 * 使用同一份模板副本，按 kvs（表单域名 → 值）填充 AcroForm，返回 PDF 字节。
 */
export async function fillDecklistPdf(
  kvs: Record<string, string | number>,
  templateBuffer: ArrayBuffer,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBuffer)
  pdfDoc.registerFontkit(fontkit)
  const form = pdfDoc.getForm()

  const baseUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/') || '/'
  // 仅用一份泛 CJK 字体（Source Han Sans），覆盖简中/日文/中文旧译/英文，减少体积
  const fontPath = `${baseUrl}fonts/SourceHanSans-Regular.otf`

  // 嵌入字体（子集嵌入）以保证跨电脑/跨阅读器显示一致
  const fontBytes = await fetch(fontPath).then((r) => {
    if (!r.ok) {
      throw new Error(`加载字体失败: ${fontPath}`)
    }
    return r.arrayBuffer()
  })
  const embeddedFont = await pdfDoc.embedFont(fontBytes, { subset: true })

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

  // 用嵌入字体生成外观流，避免依赖用户电脑字体
  try {
    form.updateFieldAppearances(embeddedFont)
  } catch {
    // ignore: 若模板字段异常，至少保留 /V + NeedAppearances
  }

  return pdfDoc.save({ updateFieldAppearances: false })
}
