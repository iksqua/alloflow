import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import PDFDocument from 'pdfkit'
import { z } from 'zod'

const invoiceSchema = z.object({
  company_name:   z.string().min(1),
  siret:          z.string().optional(),
  delivery_email: z.string().email().optional(),
})

function generateInvoicePdf(params: {
  invoiceNumber: string
  dateStr: string
  estabName: string
  estabAddress: string | null
  estabSiret: string | null
  companyName: string
  companySiret: string | undefined
  items: Array<{ product_name: string; quantity: number; unit_price: number; tva_rate: number }>
  subtotalHt: number | null
  tax55: number | null
  tax10: number | null
  tax20: number | null
  totalTtc: number
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header — establishment (left)
    doc.fontSize(20).font('Helvetica-Bold').text(params.estabName, 50, 50)
    if (params.estabAddress) doc.fontSize(10).font('Helvetica').text(params.estabAddress, 50, 75)
    if (params.estabSiret) doc.fontSize(10).text(`SIRET émetteur : ${params.estabSiret}`, 50, 90)

    // Invoice number + date (right)
    doc.fontSize(16).font('Helvetica-Bold').text(`FACTURE ${params.invoiceNumber}`, 350, 50, { width: 195, align: 'right' })
    doc.fontSize(10).font('Helvetica').text(`Date : ${params.dateStr}`, 350, 75, { width: 195, align: 'right' })

    // Separator + client info
    doc.moveTo(50, 120).lineTo(545, 120).stroke()
    doc.fontSize(11).font('Helvetica-Bold').text('Facturer à :', 50, 135)
    doc.fontSize(10).font('Helvetica').text(params.companyName, 50, 150)
    if (params.companySiret) doc.text(`SIRET : ${params.companySiret}`, 50, 165)

    // Items table header
    const tableTop = 210
    doc.font('Helvetica-Bold').fontSize(10)
    doc.text('Article', 50, tableTop)
    doc.text('Qté', 320, tableTop, { width: 60, align: 'right' })
    doc.text('Prix TTC', 390, tableTop, { width: 80, align: 'right' })
    doc.text('TVA', 480, tableTop, { width: 65, align: 'right' })
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke()

    // Items
    let y = tableTop + 25
    doc.font('Helvetica').fontSize(10)
    for (const item of params.items) {
      const ttc = item.unit_price * (1 + item.tva_rate / 100) * item.quantity
      doc.text(item.product_name, 50, y)
      doc.text(String(item.quantity), 320, y, { width: 60, align: 'right' })
      doc.text(`${ttc.toFixed(2)} €`, 390, y, { width: 80, align: 'right' })
      doc.text(`${item.tva_rate}%`, 480, y, { width: 65, align: 'right' })
      y += 18
    }

    // Totals
    doc.moveTo(50, y + 5).lineTo(545, y + 5).stroke()
    y += 15
    doc.font('Helvetica').fontSize(10)
    doc.text('Sous-total HT :', 350, y)
    doc.text(`${(params.subtotalHt ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' })
    y += 15
    if ((params.tax55 ?? 0) > 0) {
      doc.text('TVA 5,5% :', 350, y)
      doc.text(`${(params.tax55 ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' })
      y += 15
    }
    if ((params.tax10 ?? 0) > 0) {
      doc.text('TVA 10% :', 350, y)
      doc.text(`${(params.tax10 ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' })
      y += 15
    }
    if ((params.tax20 ?? 0) > 0) {
      doc.text('TVA 20% :', 350, y)
      doc.text(`${(params.tax20 ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' })
      y += 15
    }
    doc.font('Helvetica-Bold').fontSize(12)
    doc.text('TOTAL TTC :', 350, y)
    doc.text(`${params.totalTtc.toFixed(2)} €`, 480, y, { width: 65, align: 'right' })

    // Footer
    doc.fontSize(8).font('Helvetica').text('Alloflow — logiciel de caisse certifié', 50, 760, { align: 'center', width: 495 })

    doc.end()
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = invoiceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const estabId = profile.establishment_id

  // Fetch order + items
  const { data: order } = await supabase
    .from('orders')
    .select('created_at, total_ttc, status, subtotal_ht, tax_5_5, tax_10, tax_20, order_items(product_name, quantity, unit_price, tva_rate)')
    .eq('id', orderId)
    .eq('establishment_id', estabId)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, address, siret')
    .eq('id', estabId)
    .single()

  if (!estab) return NextResponse.json({ error: 'establishment_not_found' }, { status: 500 })

  const year = new Date().getFullYear()
  const serviceClient = createServiceClient()

  // Step 1: Register invoice atomically to get the invoice number
  const { data: invoiceData, error: rpcError } = await serviceClient.rpc('insert_invoice_atomic', {
    p_establishment_id: estabId,
    p_order_id:         orderId,
    p_year:             year,
    p_company_name:     parsed.data.company_name,
    p_siret:            parsed.data.siret ?? null,
    p_delivery_email:   parsed.data.delivery_email ?? null,
    p_pdf_url:          null,
  })

  const rows = invoiceData as unknown as Array<{ invoice_id: string; invoice_number: string }> | null
  if (rpcError || !rows?.[0]) {
    console.error('[invoice] RPC insert failed:', rpcError)
    return NextResponse.json({ error: 'invoice_insert_failed' }, { status: 500 })
  }

  const { invoice_id: invoiceId, invoice_number: invoiceNumber } = rows[0]

  const dateStr = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(order.created_at))
  const items = (order.order_items ?? []) as Array<{ product_name: string; quantity: number; unit_price: number; tva_rate: number }>

  // Step 2: Generate PDF with the actual invoice number
  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber,
    dateStr,
    estabName: estab.name,
    estabAddress: estab.address,
    estabSiret: estab.siret,
    companyName: parsed.data.company_name,
    companySiret: parsed.data.siret,
    items,
    subtotalHt: order.subtotal_ht,
    tax55: order.tax_5_5,
    tax10: order.tax_10,
    tax20: order.tax_20,
    totalTtc: order.total_ttc,
  })

  // Step 3: Upload PDF to Supabase Storage
  const fileName = `${estabId}/${invoiceNumber}.pdf`
  const { error: uploadError } = await serviceClient.storage
    .from('invoices')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('[invoice] Storage upload failed:', uploadError)
    return NextResponse.json({ error: 'pdf_upload_failed' }, { status: 500 })
  }

  // Step 4: Update invoice row with pdf_url
  await serviceClient.from('invoices').update({ pdf_url: fileName }).eq('id', invoiceId)

  // Step 5: Create signed URL (1h)
  const { data: signedData } = await serviceClient.storage
    .from('invoices')
    .createSignedUrl(fileName, 3600)

  if (!signedData?.signedUrl) {
    return NextResponse.json({ error: 'signed_url_failed' }, { status: 500 })
  }

  return NextResponse.json({ pdf_url: signedData.signedUrl, invoice_number: invoiceNumber })
}
