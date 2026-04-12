// src/app/dashboard/crm/[id]/_components/customer-order-history.tsx

interface OrderItem {
  name: string
  quantity: number
}

interface Order {
  id: string
  created_at: string
  total_ttc: number
  payment_method: string | null
  items: OrderItem[]
  points_earned: number
}

interface Props {
  orders: Order[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(amount: number) {
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function formatItems(items: OrderItem[]) {
  if (items.length === 0) return '—'
  return items.map((i) => `${i.name} × ${i.quantity}`).join(', ')
}

export function CustomerOrderHistory({ orders }: Props) {
  return (
    <div className="rounded-[14px] p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="text-[13px] font-semibold text-[var(--text1)] mb-4">Historique des commandes</h2>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-[var(--text3)]">
          <span className="text-3xl mb-2">🧾</span>
          <p className="text-sm">Aucune commande enregistrée</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['Date', 'Produits', 'Montant TTC', 'Points gagnés'].map((col) => (
                  <th
                    key={col}
                    className="pb-3 text-left text-xs font-medium text-[var(--text3)] uppercase tracking-wide"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order, i) => (
                <tr
                  key={order.id}
                  className={[
                    'border-b border-[var(--border)]',
                    i === orders.length - 1 ? 'border-b-0' : '',
                  ].join(' ')}
                >
                  <td className="py-3 pr-4 text-sm text-[var(--text3)] whitespace-nowrap">
                    {formatDate(order.created_at)}
                  </td>
                  <td className="py-3 pr-4 text-sm text-[var(--text1)] max-w-[240px]">
                    <span className="line-clamp-2">{formatItems(order.items)}</span>
                  </td>
                  <td className="py-3 pr-4 text-sm font-medium text-[var(--text1)] whitespace-nowrap">
                    {formatCurrency(order.total_ttc)}
                  </td>
                  <td className="py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}
                    >
                      +{order.points_earned} pts
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
