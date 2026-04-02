// src/app/api/receipts/[orderId]/email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoEmail } from '@/lib/brevo'
import { z } from 'zod'

const emailSchema = z.object({ email: z.string().email() })

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildReceiptHtml(order: {
  created_at: string
  total_ttc: number
  items: Array<{ product_name: string; emoji: string | null; quantity: number; unit_price: number; tva_rate: number; line_total: number }>
}, establishment: { name: string; address: string | null; siret: string | null; receipt_footer: string | null }): string {
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(order.created_at))

  const itemRows = order.items.map(i => {
    const ttcLine = i.line_total  // Use stored authoritative value
    return `<tr>
      <td style="padding:4px 8px">${i.emoji ?? ''} ${esc(i.product_name)}</td>
      <td style="padding:4px 8px;text-align:right">×${i.quantity}</td>
      <td style="padding:4px 8px;text-align:right">${ttcLine.toFixed(2)} €</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html><html lang="fr"><body style="font-family:sans-serif;background:#f8fafc;padding:24px;color:#1e293b">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
    <h1 style="font-size:20px;font-weight:700;margin-bottom:4px">${esc(establishment.name)}</h1>
    ${establishment.address ? `<p style="font-size:12px;color:#64748b;margin:0">${esc(establishment.address)}</p>` : ''}
    ${establishment.siret ? `<p style="font-size:12px;color:#64748b;margin:0">SIRET : ${esc(establishment.siret)}</p>` : ''}
    <p style="font-size:12px;color:#64748b;margin:8px 0 16px">Le ${dateStr}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="border-bottom:1px solid #e2e8f0">
        <th style="padding:4px 8px;text-align:left">Article</th>
        <th style="padding:4px 8px;text-align:right">Qté</th>
        <th style="padding:4px 8px;text-align:right">Prix TTC</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div style="border-top:2px solid #e2e8f0;margin-top:12px;padding-top:12px;text-align:right">
      <span style="font-size:18px;font-weight:700">Total TTC : ${order.total_ttc.toFixed(2)} €</span>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:20px">
      ${esc(establishment.receipt_footer ?? 'Merci de votre visite !')}
    </p>
  </div>
  </body></html>`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = emailSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('created_at, total_ttc, status, order_items(product_name, emoji, quantity, unit_price, tva_rate, line_total)')
    .eq('id', orderId)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, address, siret, receipt_footer')
    .eq('id', profile.establishment_id)
    .single()

  if (!estab) return NextResponse.json({ error: 'establishment_not_found' }, { status: 500 })

  try {
    const items = (order.order_items ?? []) as Array<{ product_name: string; emoji: string | null; quantity: number; unit_price: number; tva_rate: number; line_total: number }>
    const htmlContent = buildReceiptHtml(
      { created_at: order.created_at, total_ttc: order.total_ttc, items },
      estab
    )
    await sendBrevoEmail({
      to:      { email: parsed.data.email },
      subject: `Votre reçu — ${estab.name}`,
      htmlContent,
    })
    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[receipt/email]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'send_failed' }, { status: 500 })
  }
}
