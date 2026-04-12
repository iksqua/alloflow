'use client'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Payment {
  method: 'card' | 'cash' | 'ticket_resto'
  amount: number
}

interface OrderItem {
  product_name: string
  emoji: string | null
  quantity: number
  unit_price: number
  tva_rate: number
  line_total: number
}

interface Order {
  id: string
  total_ttc: number
  status: string
  created_at: string
  customer_id: string | null
  note: string | null
  payments: Payment[]
  items: OrderItem[]
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

const METHOD_LABEL: Record<string, string> = {
  card:         'Carte bancaire',
  cash:         'Espèces',
  ticket_resto: 'Ticket restaurant',
}

const METHOD_ICON: Record<string, string> = {
  card:         '💳',
  cash:         '💵',
  ticket_resto: '🎫',
}

function PaymentBadges({ payments }: { payments: Payment[] }) {
  if (!payments || payments.length === 0) return <span className="text-[var(--text4)] text-xs">—</span>

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

function OrderDetailPanel({
  order,
  onClose,
  canRefund,
  refunding,
  onRefund,
}: {
  order: Order
  onClose: () => void
  canRefund: boolean
  refunding: string | null
  onRefund: (order: Order) => void
}) {
  const items = order.items ?? []

  const subtotalHT = items.reduce((sum, item) => {
    const ht = item.unit_price * item.quantity
    return sum + ht
  }, 0)

  const totalTVA = order.total_ttc - subtotalHT

  const groupedPayments = (order.payments ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount
    return acc
  }, {})

  const label = `#${order.id.slice(0, 8).toUpperCase()}`

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
        aria-label="Fermer le panneau"
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-y-auto w-full sm:w-96"
        style={{
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 sticky top-0 z-10"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[var(--text1)]">Commande {label}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASSES[order.status] ?? ''}`}>
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              {new Date(order.created_at).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text4)] hover:text-[var(--text1)] transition-colors text-xl leading-none ml-2 mt-0.5"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-5 flex-1">

          {/* Items list */}
          <div>
            <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-3">Articles</p>
            {items.length === 0 ? (
              <p className="text-xs text-[var(--text4)]">Aucun article</p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((item, i) => {
                  const htLine = item.unit_price * item.quantity
                  return (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-2 text-sm"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        {item.emoji && (
                          <span className="text-base leading-tight shrink-0">{item.emoji}</span>
                        )}
                        <div className="min-w-0">
                          <p className="text-[var(--text1)] font-medium truncate">{item.product_name}</p>
                          <p className="text-xs text-[var(--text4)]">
                            {item.quantity} × {item.unit_price.toFixed(2)} € HT · TVA {item.tva_rate}%
                          </p>
                        </div>
                      </div>
                      <span className="text-[var(--text2)] font-semibold tabular-nums shrink-0">
                        {item.line_total.toFixed(2)} €
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Separator */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Totals */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-[var(--text3)]">
              <span>Sous-total HT</span>
              <span className="tabular-nums">{subtotalHT.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--text3)]">
              <span>TVA</span>
              <span className="tabular-nums">{totalTVA.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-[var(--text1)] mt-1">
              <span>Total TTC</span>
              <span className="tabular-nums">{order.total_ttc.toFixed(2)} €</span>
            </div>
          </div>

          {/* Separator */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Payments */}
          <div>
            <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Paiement</p>
            {Object.keys(groupedPayments).length === 0 ? (
              <p className="text-xs text-[var(--text4)]">—</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {Object.entries(groupedPayments).map(([method, amount]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span className="text-[var(--text2)]">
                      {METHOD_ICON[method] ?? '?'} {METHOD_LABEL[method] ?? method}
                    </span>
                    <span className="tabular-nums text-[var(--text2)]">{amount.toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Note */}
          {order.note && (
            <>
              <div style={{ borderTop: '1px solid var(--border)' }} />
              <div>
                <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">Note</p>
                <p className="text-sm text-[var(--text3)]">{order.note}</p>
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div
          className="px-5 py-4 flex flex-col gap-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <Link
            href={`/receipt/${order.id}`}
            className="w-full text-sm font-semibold px-4 py-2.5 rounded-lg text-center transition-colors"
            style={{ background: 'var(--surface2)', color: 'var(--text1)', border: '1px solid var(--border)' }}
          >
            Voir le reçu
          </Link>
          {canRefund && order.status === 'paid' && (
            <button
              onClick={() => onRefund(order)}
              disabled={refunding === order.id}
              className="w-full text-sm font-semibold px-4 py-2.5 rounded-lg bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-colors disabled:opacity-50"
            >
              {refunding === order.id ? 'Remboursement en cours…' : 'Rembourser'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export function OrdersPageClient({ initialOrders, userRole }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [refunding, setRefunding] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const router = useRouter()

  const canRefund = userRole === 'admin' || userRole === 'super_admin'

  const filtered = useMemo(() => {
    let list = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(o =>
        o.id.slice(0, 8).toUpperCase().includes(q.toUpperCase()) ||
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
    const label = `#${order.id.slice(0, 8).toUpperCase()}`
    if (!confirm(`Rembourser la commande ${label} (${order.total_ttc.toFixed(2)} €) ?`)) return
    setRefunding(order.id)
    try {
      const res = await fetch(`/api/orders/${order.id}/refund`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur remboursement'); return }
      toast.success(`Commande ${label} remboursée`)
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'refunded' } : o))
      // Update selected order status in panel if it's the same
      setSelectedOrder(prev => prev?.id === order.id ? { ...prev, status: 'refunded' } : prev)
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par #, montant…"
            className="w-full sm:max-w-xs text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
          />
          <div className="flex gap-2 flex-wrap">
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
        <div className="rounded-xl border border-[var(--border)] overflow-x-auto" style={{ background: 'var(--surface)' }}>
          <table className="w-full text-sm min-w-[540px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide hidden sm:table-cell">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Montant TTC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide hidden md:table-cell">Paiement</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Statut</th>
                <th className="px-4 py-3"></th>
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
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--surface2)]/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text4)]">
                    {`#${order.id.slice(0, 8).toUpperCase()}`}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text3)] hidden sm:table-cell">
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
                  <td className="px-4 py-3 hidden md:table-cell">
                    <PaymentBadges payments={order.payments} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASSES[order.status] ?? ''}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
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

      {/* Detail panel */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          canRefund={canRefund}
          refunding={refunding}
          onRefund={handleRefund}
        />
      )}
    </div>
  )
}
