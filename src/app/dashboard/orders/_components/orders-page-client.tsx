'use client'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Payment {
  method: 'card' | 'cash' | 'ticket_resto'
  amount: number
}

interface Order {
  id: string
  order_number: number | null
  total_ttc: number
  status: string
  created_at: string
  customer_id: string | null
  note: string | null
  payments: Payment[]
}

interface Props {
  initialOrders: Order[]
  userRole: string
}

const STATUS_LABELS: Record<string, string> = {
  paid:      'Payée',
  refunded:  'Remboursée',
  cancelled: 'Annulée',
}

const STATUS_CLASSES: Record<string, string> = {
  paid:      'bg-green-900/20 text-green-400',
  refunded:  'bg-amber-900/20 text-amber-400',
  cancelled: 'bg-red-900/20 text-red-400',
}

const METHOD_ICON: Record<string, string> = {
  card:         '💳',
  cash:         '💵',
  ticket_resto: '🎫',
}

function PaymentBadges({ payments }: { payments: Payment[] }) {
  if (!payments || payments.length === 0) return <span className="text-[var(--text4)] text-xs">—</span>

  // Group by method
  const grouped = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount
    return acc
  }, {})

  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(grouped).map(([method, amount]) => (
        <span
          key={method}
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: 'var(--surface2)', color: 'var(--text3)' }}
          title={`${amount.toFixed(2)} € en ${method}`}
        >
          {METHOD_ICON[method] ?? '?'} {amount.toFixed(2)} €
        </span>
      ))}
    </div>
  )
}

export function OrdersPageClient({ initialOrders, userRole }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [refunding, setRefunding] = useState<string | null>(null)
  const router = useRouter()

  const canRefund = userRole === 'admin' || userRole === 'super_admin'

  const filtered = useMemo(() => {
    let list = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(o =>
        (o.order_number ? `#${o.order_number}` : '').includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.total_ttc.toFixed(2).includes(q)
      )
    }
    return list
  }, [orders, statusFilter, search])

  const stats = useMemo(() => {
    const paid = orders.filter(o => o.status === 'paid')
    const revenue = paid.reduce((s, o) => s + o.total_ttc, 0)
    const refunded = orders.filter(o => o.status === 'refunded').length
    return { count: paid.length, revenue, refunded }
  }, [orders])

  async function handleRefund(order: Order) {
    const label = order.order_number ? `#${order.order_number}` : order.id.slice(0, 8)
    if (!confirm(`Rembourser la commande ${label} (${order.total_ttc.toFixed(2)} €) ?`)) return
    setRefunding(order.id)
    try {
      const res = await fetch(`/api/orders/${order.id}/refund`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur remboursement'); return }
      toast.success(`Commande ${label} remboursée`)
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'refunded' } : o))
      router.refresh()
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setRefunding(null)
    }
  }

  return (
    <div>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Commandes</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">Historique des transactions</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Commandes payées', value: stats.count, fmt: (v: number) => v.toString() },
            { label: 'Chiffre d\'affaires', value: stats.revenue, fmt: (v: number) => `${v.toFixed(2)} €` },
            { label: 'Remboursements', value: stats.refunded, fmt: (v: number) => v.toString() },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-1">{s.label}</p>
              <p className="text-2xl font-black text-[var(--text1)]">{s.fmt(s.value)}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par #, montant…"
            className="flex-1 max-w-xs text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
          />
          <div className="flex gap-2">
            {(['all', 'paid', 'refunded', 'cancelled'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  statusFilter === f
                    ? 'bg-[var(--blue)] text-white'
                    : 'bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text1)]'
                }`}
              >
                {f === 'all' ? 'Toutes' : STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['#', 'Date', 'Montant TTC', 'Paiement', 'Statut', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--text4)] text-sm">
                    Aucune commande
                  </td>
                </tr>
              )}
              {filtered.map(order => (
                <tr key={order.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--surface2)]/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text4)]">
                    {order.order_number ? `#${order.order_number}` : order.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text3)]">
                    {new Date(order.created_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className={`px-4 py-3 font-bold tabular-nums ${
                    order.status === 'refunded' ? 'text-amber-400' : 'text-[var(--text1)]'
                  }`}>
                    {order.total_ttc.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3">
                    <PaymentBadges payments={order.payments} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASSES[order.status] ?? ''}`}>
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
                        {refunding === order.id ? 'En cours…' : 'Rembourser'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[var(--text4)] mt-3 text-center">
          {filtered.length} commande{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
