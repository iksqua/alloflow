'use client'
import { useState } from 'react'
import type { Category } from './types'

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#06b6d4','#ec4899']

interface CategoriesModalProps {
  categories: Category[]
  onClose: () => void
  onCreate: (name: string, color_hex: string, icon: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function CategoriesModal({ categories, onClose, onCreate, onRename, onDelete }: CategoriesModalProps) {
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!newName.trim()) return
    setLoading(true)
    try {
      await onCreate(newName.trim(), newColor, newIcon.trim())
      setNewName('')
      setNewIcon('')
      setNewColor(COLORS[0])
    } finally { setLoading(false) }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return
    setLoading(true)
    try {
      await onRename(id, editingName.trim())
      setEditingId(null)
    } finally { setLoading(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay-bg)' }}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--border)]"
        style={{ background: 'var(--surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text1)]">Gérer les catégories</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">{categories.length} catégorie{categories.length > 1 ? 's' : ''} · Glissez pour réordonner</p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] transition-colors">✕</button>
        </div>

        {/* Liste */}
        <div className="px-5 py-3 max-h-64 overflow-y-auto space-y-1">
          {categories.length === 0 && (
            <p className="text-sm text-[var(--text4)] text-center py-4">Aucune catégorie — créez-en une ci-dessous</p>
          )}
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--surface2)] transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: cat.color_hex }}
              />
              {editingId === cat.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(cat.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="flex-1 text-sm bg-transparent border-b border-[var(--blue)] text-[var(--text1)] focus:outline-none"
                />
              ) : (
                <span className="flex-1 text-sm text-[var(--text2)]">
                  {cat.icon && <span className="mr-1">{cat.icon}</span>}
                  {cat.name}
                </span>
              )}
              {cat.products_count !== undefined && (
                <span className="text-xs text-[var(--text4)]">{cat.products_count} produits</span>
              )}
              <button
                onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--text1)] hover:bg-[var(--surface2)] transition-colors text-xs"
                title="Renommer"
              >✏️</button>
              <button
                onClick={() => onDelete(cat.id)}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors text-xs"
                title="Supprimer"
              >🗑️</button>
            </div>
          ))}
        </div>

        {/* Créer nouvelle */}
        <div className="px-5 py-4 border-t border-[var(--border)] space-y-3">
          <div className="flex gap-2">
            <input
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              placeholder="☕"
              className="w-12 h-9 text-center rounded-lg text-sm border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
              style={{ background: 'var(--surface2)' }}
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Nom de la catégorie..."
              className="flex-1 h-9 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
              style={{ background: 'var(--surface2)' }}
            />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-[var(--text3)]">Couleur :</span>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  outline: newColor === c ? `2px solid ${c}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
              style={{ background: 'var(--surface)' }}
            >Annuler</button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || loading}
              className="h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--blue)' }}
            >+ Nouvelle catégorie</button>
          </div>
        </div>
      </div>
    </div>
  )
}
