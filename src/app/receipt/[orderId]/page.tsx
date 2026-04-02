// src/app/receipt/[orderId]/page.tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ orderId: string }>
}

export default async function ReceiptPage({ params }: Props) {
  const { orderId } = await params
  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select('created_at, total_ttc, status, subtotal_ht, tax_5_5, tax_10, tax_20, order_items(product_name, emoji, quantity, unit_price, tva_rate), establishments(name, address, siret, receipt_footer)')
    .eq('id', orderId)
    .eq('status', 'paid')
    .single()

  if (!order) notFound()

  type EstabShape = { name: string; address: string | null; siret: string | null; receipt_footer: string | null }
  const estabRaw = order.establishments as unknown as EstabShape | EstabShape[] | null
  const estab: EstabShape | null = Array.isArray(estabRaw) ? (estabRaw[0] ?? null) : estabRaw
  const items = (order.order_items ?? []) as Array<{ product_name: string; emoji: string | null; quantity: number; unit_price: number; tva_rate: number }>

  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  }).format(new Date(order.created_at))

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '32px 24px', maxWidth: '480px', width: '100%', color: '#f1f5f9' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: 'white' }}>A</div>
            <span style={{ fontSize: '18px', fontWeight: '700' }}>{estab?.name ?? 'Établissement'}</span>
          </div>
          {estab?.address && <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{estab.address}</p>}
          {estab?.siret && <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>SIRET : {estab.siret}</p>}
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{dateStr}</p>
        </div>

        {/* Items */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', marginBottom: '16px' }}>
          {items.map((item, i) => {
            const ttc = item.unit_price * (1 + item.tva_rate / 100) * item.quantity
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '14px' }}>
                <span style={{ color: '#f1f5f9' }}>{item.emoji ? `${item.emoji} ` : ''}{item.product_name} <span style={{ color: '#64748b' }}>×{item.quantity}</span></span>
                <span style={{ fontWeight: '600', color: '#f1f5f9' }}>{ttc.toFixed(2).replace('.', ',')} €</span>
              </div>
            )
          })}
        </div>

        {/* TVA detail */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: '12px', marginBottom: '12px', fontSize: '12px', color: '#64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sous-total HT</span><span>{(order.subtotal_ht ?? 0).toFixed(2).replace('.', ',')} €</span></div>
          {(order.tax_5_5 ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 5,5%</span><span>{(order.tax_5_5 ?? 0).toFixed(2).replace('.', ',')} €</span></div>}
          {(order.tax_10  ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 10%</span><span>{(order.tax_10  ?? 0).toFixed(2).replace('.', ',')} €</span></div>}
          {(order.tax_20  ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 20%</span><span>{(order.tax_20  ?? 0).toFixed(2).replace('.', ',')} €</span></div>}
        </div>

        {/* Total */}
        <div style={{ borderTop: '2px solid #334155', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '16px', fontWeight: '700' }}>Total TTC</span>
          <span style={{ fontSize: '24px', fontWeight: '900' }}>{(order.total_ttc ?? 0).toFixed(2).replace('.', ',')} €</span>
        </div>

        {/* Footer */}
        {estab?.receipt_footer && (
          <p style={{ fontSize: '11px', color: '#475569', textAlign: 'center', marginTop: '20px' }}>
            {estab.receipt_footer}
          </p>
        )}
      </div>
    </div>
  )
}
