// src/app/dashboard/stocks/commandes/_components/purchase-order-detail-panel.tsx
import type { PurchaseOrder } from './types'
import { statusLabel, statusBadgeClass, isLate, remaining } from './types'

interface Props {
  order: PurchaseOrder
  onClose: () => void
  onReceive: () => void
  onEdit: () => void
  onCancel: () => void
}

export function PurchaseOrderDetailPanel({ order, onClose, onReceive, onEdit, onCancel }: Props) {
  const canReceive = order.status === 'pending' || order.status === 'partial'
  const canEdit    = order.status === 'pending' || order.status === 'partial'
  const canCancel  = order.status !== 'received' && order.status !== 'cancelled'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] flex flex-col shadow-2xl"
        style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
      >
        {/* Panel header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[var(--text1)]">{order.order_ref}</span>
                <span className="text-[var(--text3)] text-sm">{order.supplier}</span>
              </div>
              <div className="text-xs text-[var(--text4)] mt-0.5">
                Créée le {new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                {order.requested_delivery_date && (
                  <> · Livraison : {new Date(order.requested_delivery_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}</>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl leading-none ml-4">×</button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusBadgeClass(order.status)}`}>
              {statusLabel(order.status)}
            </span>
            {isLate(order) && (
              <span className="text-xs font-semibold text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">En retard</span>
            )}
          </div>
          {/* Actions */}
          {(canReceive || canEdit || canCancel) && (
            <div className="flex gap-2 mt-3">
              {canReceive && (
                <button
                  onClick={onReceive}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg"
                  style={{ background: 'var(--blue)' }}
                >
                  Réceptionner
                </button>
              )}
              {canEdit && (
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                >
                  Modifier
                </button>
              )}
              {canCancel && (
                <button
                  onClick={onCancel}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg text-red-400 border border-red-900/30 hover:bg-red-900/10"
                >
                  Annuler
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Lines table */}
          <div>
            <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Articles</div>
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface2)' }} className="border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2 text-[var(--text3)]">Article</th>
                    <th className="text-right px-3 py-2 text-[var(--text3)]">Commandé</th>
                    <th className="text-right px-3 py-2 text-[var(--text3)]">Reçu</th>
                    <th className="text-right px-3 py-2 text-[var(--text3)]">Restant</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items ?? []).map(item => {
                    const rem = remaining(item)
                    return (
                      <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2 text-[var(--text1)]">{item.stock_item?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-[var(--text2)]">
                          {item.quantity_ordered} {item.stock_item?.unit}
                        </td>
                        <td className="px-3 py-2 text-right text-[var(--text2)]">
                          {(item.quantity_received ?? 0)} {item.stock_item?.unit}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${rem > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                          {rem > 0 ? `${rem} ${item.stock_item?.unit}` : '✓'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-right text-xs text-[var(--text3)] mt-1 pr-1">
              Total HT : <span className="font-semibold text-[var(--text1)]">{order.total_ht.toFixed(2)} €</span>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes</div>
              <p className="text-sm text-[var(--text2)] bg-[var(--surface2)] rounded-lg px-3 py-2 border border-[var(--border)]">{order.notes}</p>
            </div>
          )}

          {/* Reception history */}
          {(order.receptions ?? []).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Historique des réceptions</div>
              <div className="space-y-0">
                {(order.receptions ?? []).map((reception, idx) => {
                  const isLastReception = idx === (order.receptions ?? []).length - 1
                  return (
                    <div key={reception.id} className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                             style={{ background: isLastReception && order.status === 'received' ? 'var(--green)' : '#f59e0b' }}>
                          ●
                        </div>
                        {!isLastReception && <div className="w-0.5 flex-1 bg-[var(--border)] my-1" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="text-xs font-semibold text-[var(--text1)] mb-1">
                          {new Date(reception.received_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' — '}
                          {isLastReception && order.status === 'received' ? 'Réception complète' : 'Réception partielle'}
                        </div>
                        <div className="text-xs text-[var(--text3)]">
                          {(reception.lines as { purchase_order_item_id: string; quantity_received: number }[]).map(line => {
                            const item = (order.items ?? []).find(i => i.id === line.purchase_order_item_id)
                            if (!item) return null
                            return (
                              <span key={line.purchase_order_item_id} className="mr-3">
                                {item.stock_item?.name} : {line.quantity_received} {item.stock_item?.unit}
                              </span>
                            )
                          })}
                        </div>
                        {reception.notes && (
                          <div className="text-xs text-[var(--text4)] mt-0.5 italic">{reception.notes}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
