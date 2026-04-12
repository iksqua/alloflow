// src/app/dashboard/stocks/commandes/_components/purchase-order-form/index.tsx
'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { StockItem } from '../../../_components/types'
import { StepItems, type OrderLine } from './step-items'
import { StepInfo } from './step-info'

interface Category { id: string; name: string; color_hex: string }

interface Props {
  stockItems: StockItem[]
  categories: Category[]
  onClose: () => void
  onSave: () => Promise<void>
}

export function PurchaseOrderForm({ stockItems, categories, onClose, onSave }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [lines, setLines] = useState<OrderLine[]>([])
  const [loading, setLoading] = useState(false)

  // Pre-select alert items on mount
  useEffect(() => {
    const alertLines: OrderLine[] = stockItems
      .filter(i => i.status === 'alert' || i.status === 'out_of_stock')
      .map(i => ({
        stockItemId: i.id,
        stockItem: i,
        quantityOrdered: i.order_quantity || 1,
        unitPrice: i.unit_price,
      }))
    setLines(alertLines)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit({ supplier, deliveryDate, notes }: { supplier: string; deliveryDate: string; notes: string }) {
    setLoading(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          requested_delivery_date: deliveryDate || null,
          notes: notes || null,
          items: lines.map(l => ({
            stock_item_id:    l.stockItemId,
            quantity_ordered: l.quantityOrdered,
            unit_price:       l.unitPrice,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erreur lors de la création')
        return
      }
      toast.success('Bon de commande créé')
      await onSave()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full sm:w-[640px] sm:max-h-[85vh] flex flex-col rounded-none sm:rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h2 className="font-bold text-[var(--text1)]">Nouveau bon de commande</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Étape {step}/2 — {step === 1 ? 'Sélection des articles' : 'Informations commande'}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl leading-none">×</button>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {step === 1 && (
            <StepItems
              stockItems={stockItems}
              categories={categories}
              initialLines={lines}
              onNext={selectedLines => { setLines(selectedLines); setStep(2) }}
            />
          )}
          {step === 2 && (
            <StepInfo
              lines={lines}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  )
}
