'use client'
import { useState, useEffect } from 'react'
import type { Category } from './types'

interface StockItem {
  id: string
  name: string
  unit: string
  unit_price: number
  is_pos: boolean
}

interface RowState {
  posPrice: string
  posTvaRate: number
  posCategoryId: string
  loading: boolean
  done: boolean
  error: string | null
}

const TVA_RATES = [5.5, 10, 20]

interface Props {
  open: boolean
  categories: Category[]
  onClose: () => void
  onImported: () => void
}

export function StockImportModal({ open, categories, onClose, onImported }: Props) {
  const [items, setItems]   = useState<StockItem[]>([])
  const [rows, setRows]     = useState<Record<string, RowState>>({})
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!open) return
    setFetching(true)
    fetch('/api/stock-items')
      .then(r => r.json())
      .then(json => {
        const eligible: StockItem[] = (json.items ?? []).filter((i: StockItem) => !i.is_pos)
        setItems(eligible)
        const init: Record<string, RowState> = {}
        eligible.forEach((i: StockItem) => {
          init[i.id] = { posPrice: '', posTvaRate: 10, posCategoryId: '', loading: false, done: false, error: null }
        })
        setRows(init)
      })
      .finally(() => setFetching(false))
  }, [open])

  if (!open) return null

  function setRow(id: string, patch: Partial<RowState>) {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function handleActivate(item: StockItem) {
    const row = rows[item.id]
    if (!row.posPrice) { setRow(item.id, { error: 'Prix requis' }); return }
    setRow(item.id, { loading: true, error: null })
    try {
      const res = await fetch(`/api/stock-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_pos:          true,
          pos_price:       parseFloat(row.posPrice),
          pos_tva_rate:    row.posTvaRate,
          pos_category_id: row.posCategoryId || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        const msg = typeof j.error === 'string' ? j.error : 'Erreur serveur'
        setRow(item.id, { loading: false, error: msg }); return
      }
      setRow(item.id, { loading: false, done: true })
      onImported()
    } catch {
      setRow(item.id, { loading: false, error: 'Erreur réseau' })
    }
  }

  const pending = items.filter(i => !rows[i.id]?.done)
  const doneCount = items.length - pending.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'var(--overlay-bg)' }}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-[var(--border)]"
           style={{ background: 'var(--surface)' }}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text1)]">Importer depuis le stock</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Articles de stock non encore vendus en caisse — saisissez un prix pour les activer
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {fetching && (
            <div className="text-center py-10 text-[var(--text4)] text-sm">Chargement…</div>
          )}

          {!fetching && items.length === 0 && (
            <div className="text-center py-10 text-[var(--text4)]">
              <div className="text-3xl mb-2">✓</div>
              <div className="text-sm font-medium text-[var(--text2)]">Tous vos articles de stock sont déjà en caisse</div>
            </div>
          )}

          {!fetching && items.length > 0 && (
            <div className="space-y-3">
              {doneCount > 0 && (
                <p className="text-xs text-green-400">{doneCount} article{doneCount > 1 ? 's' : ''} activé{doneCount > 1 ? 's' : ''}</p>
              )}
              {items.map(item => {
                const row = rows[item.id]
                if (!row) return null
                if (row.done) return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-green-800/30 bg-green-900/10">
                    <span className="text-green-400 text-xs">✓</span>
                    <span className="text-sm text-[var(--text2)] flex-1">{item.name}</span>
                    <span className="text-xs text-green-400">Activé en caisse</span>
                  </div>
                )
                return (
                  <div key={item.id} className="rounded-lg border border-[var(--border)] p-3" style={{ background: 'var(--bg)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-sm font-semibold text-[var(--text1)]">{item.name}</span>
                        <span className="ml-2 text-xs text-[var(--text4)]">{item.unit_price.toFixed(2)} €/{item.unit}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-[var(--text4)] uppercase tracking-wide mb-1">Prix TTC *</label>
                        <div className="relative">
                          <input
                            type="number" step="0.01" value={row.posPrice}
                            onChange={e => setRow(item.id, { posPrice: e.target.value, error: null })}
                            placeholder="2.50"
                            className="w-full px-2 py-1.5 pr-5 rounded-md border border-[var(--border)] text-[var(--text2)] text-xs focus:outline-none focus:border-[var(--blue)]"
                            style={{ background: 'var(--surface2)' }}
                          />
                          <span className="absolute right-1.5 top-2 text-[10px] text-[var(--text4)]">€</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--text4)] uppercase tracking-wide mb-1">TVA</label>
                        <select value={row.posTvaRate} onChange={e => setRow(item.id, { posTvaRate: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text2)] text-xs focus:outline-none focus:border-[var(--blue)]"
                          style={{ background: 'var(--surface2)' }}>
                          {TVA_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--text4)] uppercase tracking-wide mb-1">Catégorie caisse</label>
                        <select value={row.posCategoryId} onChange={e => setRow(item.id, { posCategoryId: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text2)] text-xs focus:outline-none focus:border-[var(--blue)]"
                          style={{ background: 'var(--surface2)' }}>
                          <option value="">— Aucune —</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {row.error && <p className="text-[10px] text-red-400 mt-1">{row.error}</p>}
                    <div className="flex items-center justify-between mt-2">
                      {row.posPrice && (
                        <span className="text-[10px] text-[var(--text4)]">
                          HT : {(parseFloat(row.posPrice) / (1 + row.posTvaRate / 100)).toFixed(2)} €
                        </span>
                      )}
                      <button
                        onClick={() => handleActivate(item)}
                        disabled={row.loading}
                        className="ml-auto px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                        style={{ background: 'var(--blue)' }}
                      >
                        {row.loading ? '…' : 'Activer en caisse'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] shrink-0 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
            style={{ background: 'var(--surface)' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
