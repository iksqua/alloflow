'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Order {
  id: string
  order_number: number | null
  total_ttc: number
  status: string
  created_at: string
  customer_id: string | null
  note: string | null
}

interface Props {
  initialOrders: Order[]
  userRole: string
}

const STATUS_LABELS: Record<string, string> = {
  paid:      'Payee',
  refunded:  'Remboursee',
  cancelled: 'Annulee',
}

const STATUS_CLASSES: Record<string, string> = {
  paid:      'bg-green-900/20 text-green-400',
  refunded:  'bg-amber-900/20 text-amber-400',
  cancelled: 'bg-red-900/20 text-red-400',
}

export function OrdersPageClient({ initialOrders, userRole }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [filter, setFilter] = useState<string>('all')
  const [refunding, setRefunding] = useState<string | null>(null)
  const router = useRouter()

  const canRefund = userRole === 'admin' || userRole === 'super_admin'

  const filtered = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter)

  async function handleRefund(order: Order) {
    const orderLabel = order.order_number ? `#${order.order_number}` : order.id.slice(0, 8)
    if (!confirm(`Rembourser la commande ${orderLabel} (${order.total_ttc.toFixed(2)} EUR) ?`)) return

    setRefunding(order.id)
    try {
      const res = await fetch(`/api/orders/${order.id}/refund`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Erreur lors du remboursement')
        return
      }
      toast.success(`Commande ${orderLabel} remboursee`)
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'refunded' } : o))
      router.refresh()
    } catch {
      toast.error('Erreur reseau')
    } finally {
      setRefunding(null)
    }
  }

  return (
    <div>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Commandes</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">Historique des commandes</p>
          </div>
          <div className="flex gap-2">
            {['all', 'paid', 'refunded', 'cancelled'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-[var(--blue)] text-white'
                    : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface2)]/80'
                }`}
              >
                {f === 'all' ? 'Toutes' : STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['#', 'Date', 'Montant TTC', 'Statut', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[var(--text4)]">
                    Aucune commande
                  </td>
                </tr>
              )}
              {filtered.map(order => (
                <tr key={order.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--surface2)]/30">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text4)]">{order.order_number ? `#${order.order_number}` : order.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text3)]">
                    {new Date(order.created_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className={`px-4 py-3 font-bold tabular-nums ${
                    order.status === 'refunded' ? 'text-amber-400' : 'text-[var(--text1)]'
                  }`}>
                    {order.total_ttc.toFixed(2)} EUR
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLASSES[order.status] ?? ''}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canRefund && order.status === 'paid' && (
                      <button
                        onClick={() => handleRefund(order)}
                        disabled={refunding === order.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                      >
                        {refunding === order.id ? 'Remboursement...' : 'Rembourser'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[var(--text4)] mt-4 text-center">
          {filtered.length} commande{filtered.length > 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
