'use client'
import type { Product } from './types'

interface DeleteConfirmModalProps {
  product: Product | null
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({ product, onConfirm, onCancel }: DeleteConfirmModalProps) {
  if (!product) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay-bg)' }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] p-6"
        style={{ background: 'var(--surface)' }}
      >
        <div className="text-2xl mb-3">🗑️</div>
        <h2 className="text-base font-semibold text-[var(--text1)] mb-2">
          Supprimer ce produit ?
        </h2>
        <p className="text-sm text-[var(--text3)] mb-6">
          <span className="text-[var(--text1)] font-medium">{product.emoji} {product.name}</span> sera définitivement supprimé et retiré de la caisse.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
            style={{ background: 'var(--surface)' }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: 'var(--red)' }}
          >
            Supprimer définitivement
          </button>
        </div>
      </div>
    </div>
  )
}
