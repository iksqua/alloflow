// src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-items.tsx
'use client'
import { useState, useMemo } from 'react'
import type { StockItem } from '../../../_components/types'

export interface OrderLine {
  stockItemId: string
  stockItem: StockItem
  quantityOrdered: number
  unitPrice: number
}

interface Category { id: string; name: string; color_hex: string }

interface Props {
  stockItems: StockItem[]
  categories: Category[]
  initialLines: OrderLine[]
  onNext: (lines: OrderLine[]) => void
}

export function StepItems({ stockItems, categories, initialLines, onNext }: Props) {
  const [selection, setSelection] = useState<Map<string, OrderLine>>(() => {
    const m = new Map<string, OrderLine>()
    initialLines.forEach(l => m.set(l.stockItemId, l))
    return m
  })
  const [activeTab, setActiveTab] = useState<string>('alerts')
  const [search, setSearch] = useState('')

  const alertItems = useMemo(() => stockItems.filter(i => i.status === 'alert' || i.status === 'out_of_stock'), [stockItems])
  const tabs = useMemo(() => [
    { key: 'alerts', label: `⚠ Alertes (${alertItems.length})`, items: alertItems },
    ...categories.map(c => ({
      key: c.id,
      label: c.name,
      items: stockItems.filter(i => i.category === c.name || (i as unknown as { pos_category_id?: string }).pos_category_id === c.id),
    })),
    { key: 'all', label: 'Tous', items: stockItems },
  ], [stockItems, categories, alertItems])

  const currentItems = useMemo(() => {
    const tab = tabs.find(t => t.key === activeTab)
    const items = tab?.items ?? []
    if (activeTab === 'all' && search) {
      return items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    }
    return items
  }, [tabs, activeTab, search])

  function toggleItem(item: StockItem) {
    setSelection(prev => {
      const next = new Map(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.set(item.id, {
          stockItemId: item.id,
          stockItem: item,
          quantityOrdered: item.order_quantity || 1,
          unitPrice: item.unit_price,
        })
      }
      return next
    })
  }

  function updateQty(itemId: string, qty: number) {
    setSelection(prev => {
      const next = new Map(prev)
      const line = next.get(itemId)
      if (line) next.set(itemId, { ...line, quantityOrdered: qty })
      return next
    })
  }

  const selectedLines = Array.from(selection.values())
  const totalEstimated = selectedLines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0)

  function stockColor(status: string): string {
    if (status === 'out_of_stock') return 'text-red-400'
    if (status === 'alert') return 'text-amber-400'
    return 'text-green-400'
  }

  function stockLabel(item: StockItem): string {
    if (item.status === 'out_of_stock') return `✕ Rupture`
    if (item.status === 'alert') return `⚠ ${item.quantity} ${item.unit}`
    return `${item.quantity} ${item.unit}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="flex gap-0 border-b border-[var(--border)] overflow-x-auto flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--blue)] text-white'
                : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search (only on "Tous" tab) */}
      {activeTab === 'all' && (
        <div className="p-3 flex-shrink-0">
          <input
            type="text"
            placeholder="Rechercher un article…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)]"
          />
        </div>
      )}

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {currentItems.length === 0 && (
          <div className="text-center py-8 text-[var(--text4)] text-sm">Aucun article dans cette catégorie</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {currentItems.map(item => {
            const checked = selection.has(item.id)
            const line = selection.get(item.id)
            const borderColor = item.status === 'out_of_stock' ? 'border-red-800/50' : item.status === 'alert' ? 'border-amber-800/50' : 'border-[var(--border)]'
            const bgColor = item.status === 'out_of_stock' ? 'bg-red-900/10' : item.status === 'alert' ? 'bg-amber-900/10' : ''
            return (
              <div
                key={item.id}
                className={`rounded-lg p-2 border ${borderColor} ${bgColor} cursor-pointer transition-colors hover:border-[var(--blue)]`}
                onClick={() => toggleItem(item)}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mt-0.5 flex-shrink-0"
                    style={{ accentColor: 'var(--blue)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[var(--text1)] truncate">{item.name}</div>
                    <div className={`text-xs ${stockColor(item.status)}`}>{stockLabel(item)}</div>
                  </div>
                  {checked && (
                    <input
                      type="number"
                      value={line?.quantityOrdered ?? 1}
                      min={0.001}
                      step={0.1}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateQty(item.id, parseFloat(e.target.value) || 0)}
                      className="w-12 text-xs text-center bg-[var(--surface2)] border border-[var(--border)] rounded px-1 py-0.5 text-[var(--text1)]"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer bar */}
      <div className="flex-shrink-0 border-t border-[var(--border)] px-4 py-3 flex items-center justify-between"
           style={{ background: 'var(--surface2)' }}>
        <span className="text-sm text-[var(--text3)]">
          {selectedLines.length} article{selectedLines.length !== 1 ? 's' : ''} sélectionné{selectedLines.length !== 1 ? 's' : ''}
          {' · '}
          Total estimé <span className="font-semibold text-[var(--text1)]">{totalEstimated.toFixed(2)} €</span>
        </span>
        <button
          onClick={() => onNext(selectedLines)}
          disabled={selectedLines.length === 0}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--blue)' }}
        >
          Suivant →
        </button>
      </div>
    </div>
  )
}
