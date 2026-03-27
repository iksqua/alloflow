'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import './print-receipt.css'
import type { Order, LoyaltyCustomer } from '../types'

interface ReceiptModalProps {
  order: Order
  linkedCustomer: LoyaltyCustomer | null
  onClose: () => void
  onNewOrder: () => void
}

export function ReceiptModal({ order, linkedCustomer, onClose, onNewOrder }: ReceiptModalProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState<'email' | 'sms' | null>(null)

  const handlePrint = () => window.print()

  const handleEmail = async () => {
    if (!email) return
    setSending('email')
    try {
      const res = await fetch(`/api/receipts/${order.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Reçu envoyé à ${email}`)
      setEmail('')
    } catch {
      toast.error('Erreur envoi email')
    } finally {
      setSending(null)
    }
  }

  const handleSms = async () => {
    if (!phone) return
    setSending('sms')
    try {
      const res = await fetch(`/api/receipts/${order.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Reçu envoyé par SMS`)
      setPhone('')
    } catch {
      toast.error('Erreur envoi SMS')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Reçu printable (caché à l'écran, visible à l'impression) */}
        <div className="receipt-printable hidden print:block">
          <div className="receipt-center receipt-bold" style={{ fontSize: '14px' }}>ALLOFLOW</div>
          <div className="receipt-center" style={{ marginBottom: '8px' }}>
            {new Date(order.created_at).toLocaleDateString('fr-FR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
          <div className="receipt-divider" />
          {order.items?.map((item) => (
            <div key={item.product_id} className="receipt-row">
              <span>{item.quantity}× {item.product_name}</span>
              <span>{item.line_total.toFixed(2)} €</span>
            </div>
          ))}
          <div className="receipt-divider" />
          {order.discount_amount > 0 && (
            <div className="receipt-row">
              <span>Remise</span>
              <span>-{order.discount_amount.toFixed(2)} €</span>
            </div>
          )}
          <div className="receipt-row receipt-bold" style={{ fontSize: '13px' }}>
            <span>TOTAL TTC</span>
            <span>{order.total_ttc.toFixed(2)} €</span>
          </div>
          <div className="receipt-divider" />
          <div className="receipt-center" style={{ marginTop: '8px', fontSize: '10px' }}>
            Merci de votre visite !
          </div>
        </div>

        {/* Interface écran */}
        <div className="p-6 print:hidden">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-[var(--green-bg)] flex items-center justify-center text-3xl mx-auto mb-3">
              ✓
            </div>
            <h2 className="text-lg font-bold text-[var(--text1)]">Paiement validé</h2>
            <p className="text-2xl font-bold text-[var(--green)] mt-1">
              {order.total_ttc.toFixed(2).replace('.', ',')} €
            </p>
          </div>

          {linkedCustomer && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
              style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)' }}>
              <div className="w-9 h-9 rounded-full bg-[var(--green)] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {linkedCustomer.first_name[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--green)]">
                  +{Math.round(order.total_ttc)} pts crédités !
                </div>
                <div className="text-xs text-[var(--text4)]">
                  {linkedCustomer.first_name} · {linkedCustomer.points + Math.round(order.total_ttc)} pts au total
                </div>
              </div>
            </div>
          )}

          {/* Actions reçu */}
          <div className="space-y-3 mb-6">
            <button
              onClick={handlePrint}
              className="w-full h-10 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex items-center justify-center gap-2"
            >
              🖨 Imprimer le reçu
            </button>

            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@client.fr"
                className="flex-1 h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
              />
              <button
                onClick={handleEmail}
                disabled={!email || sending === 'email'}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-[var(--blue-light)] text-[var(--blue)] border border-[var(--blue)] hover:bg-[var(--blue)] hover:text-white transition-colors disabled:opacity-40"
              >
                {sending === 'email' ? '…' : '✉ Email'}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                className="flex-1 h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
              />
              <button
                onClick={handleSms}
                disabled={!phone || sending === 'sms'}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-[var(--amber-bg)] text-[var(--amber)] border border-[var(--amber)] hover:bg-[var(--amber)] hover:text-white transition-colors disabled:opacity-40"
              >
                {sending === 'sms' ? '…' : '💬 SMS'}
              </button>
            </div>
          </div>

          <button
            onClick={onNewOrder}
            className="w-full h-12 rounded-xl text-base font-bold text-white hover:opacity-90 transition-colors"
            style={{ background: 'var(--blue)' }}
          >
            Nouvelle commande →
          </button>
        </div>
      </div>
    </div>
  )
}
