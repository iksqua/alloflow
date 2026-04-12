'use client'
import { useState, useEffect } from 'react'
import type { SopCategory } from './types'

interface Props {
  open: boolean
  categories: SopCategory[]
  onClose: () => void
  onSave: () => Promise<void>
}

export function SopCategoryManager({ open, categories: initialCategories, onClose, onSave }: Props) {
  const [cats,    setCats]    = useState(initialCategories)
  const [newName, setNewName] = useState('')
  const [newEmoji,setNewEmoji]= useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) { setCats(initialCategories); setNewName(''); setNewEmoji('') }
  }, [open, initialCategories])

  if (!open) return null

  async function addCategory() {
    if (!newName.trim()) return
    setLoading(true)
    const res = await fetch('/api/sop-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), emoji: newEmoji.trim() || null, sort_order: cats.length }),
    })
    if (res.ok) {
      setNewName(''); setNewEmoji('')
      await onSave()
      const res2 = await fetch('/api/sop-categories')
      const json = await res2.json()
      setCats(json.categories ?? [])
    }
    setLoading(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm(`Supprimer cette catégorie ? Les guides associées n'auront plus de catégorie.`)) return
    await fetch(`/api/sop-categories/${id}`, { method: 'DELETE' })
    await onSave()
    setCats(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'var(--overlay-bg)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text1)]">Gérer les catégories</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">Organisez vos guides par catégories</p>
          </div>
          <button onClick={onClose} className="text-lg text-[var(--text3)] hover:text-[var(--text1)] transition-colors cursor-pointer">✕</button>
        </div>

        {/* Existing categories */}
        <div className="space-y-2 mb-5">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--border)]" style={{ background: 'var(--bg)' }}>
              <span className="text-lg">{cat.emoji ?? '📋'}</span>
              <span className="flex-1 text-sm text-[var(--text2)]">{cat.name}</span>
              <button onClick={() => deleteCategory(cat.id)}
                className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
                title="Supprimer">🗑️</button>
            </div>
          ))}
        </div>

        {/* Add new category */}
        <div className="border-t border-[var(--border)] pt-4">
          <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-3">Nouvelle catégorie</label>
          <div className="flex gap-2 mb-3">
            <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} placeholder="🏷️" maxLength={2}
              className="w-14 px-2 py-2 text-center rounded-lg border border-[var(--border)] text-[var(--text2)] text-lg focus:outline-none focus:border-[var(--blue)] transition-colors"
              style={{ background: 'var(--surface2)' }} />
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom de la catégorie"
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
              style={{ background: 'var(--surface2)' }} />
          </div>
          <button onClick={addCategory} disabled={!newName.trim() || loading}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ background: 'var(--blue)' }}>
            {loading ? 'Ajout...' : '+ Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}
