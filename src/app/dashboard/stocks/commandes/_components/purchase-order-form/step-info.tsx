// src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-info.tsx
'use client'
import { useEffect, useState } from 'react'
import type { OrderLine } from './step-items'

interface Props {
  lines: OrderLine[]
  onBack: () => void
  onSubmit: (data: { supplier: string; deliveryDate: string; notes: string }) => Promise<void>
  loading: boolean
}

export function StepInfo({ lines, onBack, onSubmit, loading }: Props) {
  const [supplier, setSupplier] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/purchase-orders/suppliers')
      .then(r => r.json())
      .then(json => setSupplierSuggestions(json.suppliers ?? []))
      .catch(() => {})
  }, [])

  const totalHt = lines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Supplier */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">
            Fournisseur <span className="text-red-400">*</span>
          </label>
          <input
            list="supplier-suggestions"
            type="text"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            placeholder="Nom du fournisseur"
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)]"
          />
          <datalist id="supplier-suggestions">
            {supplierSuggestions.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Delivery date */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Date de livraison souhaitée</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={e => setDeliveryDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)]"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Instructions particulières, références…"
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)] resize-none"
          />
        </div>

        {/* Summary */}
        <div>
          <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Récapitulatif</div>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--surface2)' }} className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-[var(--text3)]">Article</th>
                  <th className="text-right px-3 py-2 text-[var(--text3)]">Qté</th>
                  <th className="text-right px-3 py-2 text-[var(--text3)]">PU HT</th>
                  <th className="text-right px-3 py-2 text-[var(--text3)]">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.stockItemId} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text1)]">{l.stockItem.name}</td>
                    <td className="px-3 py-2 text-right text-[var(--text2)]">{l.quantityOrdered} {l.stockItem.unit}</td>
                    <td className="px-3 py-2 text-right text-[var(--text2)]">{l.unitPrice.toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--text1)]">{(l.quantityOrdered * l.unitPrice).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface2)' }}>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-[var(--text2)]">Total HT</td>
                  <td className="px-3 py-2 text-right font-bold text-[var(--text1)]">{totalHt.toFixed(2)} €</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-[var(--border)] px-5 py-3 flex gap-3 justify-between"
           style={{ background: 'var(--surface2)' }}>
        <button
          onClick={onBack}
          className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface)] border border-[var(--border)]"
        >
          ← Retour
        </button>
        <button
          onClick={() => onSubmit({ supplier, deliveryDate, notes })}
          disabled={!supplier.trim() || loading}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--blue)' }}
        >
          {loading ? 'Création…' : 'Créer le bon de commande'}
        </button>
      </div>
    </div>
  )
}
