'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProductsTable } from './products-table'
import { ProductForm } from './product-form'
import type { Product, Category } from './types'

export function ProductsPageClient({ initialProducts, categories }: { initialProducts: Product[], categories: Category[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const router = useRouter()

  function openCreate() {
    setEditingProduct(null)
    setModalOpen(true)
  }

  function openEdit(product: Product) {
    setEditingProduct(product)
    setModalOpen(true)
  }

  async function handleSave(data: Omit<Product, 'id' | 'is_active'>) {
    if (editingProduct) {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la modification')
      const updated: Product = await res.json()
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } else {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la création')
      const created: Product = await res.json()
      setProducts((prev) => [...prev, created])
    }
    router.refresh()
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Désactiver ce produit ?')) return
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
    if (!res.ok) return alert('Erreur lors de la désactivation')
    setProducts((prev) => prev.filter((p) => p.id !== id))
    router.refresh()
  }

  async function handleToggleStatus(id: string, is_active: boolean) {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    if (!res.ok) return
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active } : p)))
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={openCreate}
          className="h-9 px-4 text-sm font-semibold text-white rounded-lg"
          style={{ background: 'var(--blue)' }}
        >
          + Nouveau produit
        </Button>
      </div>

      <div className="rounded-lg border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
        <ProductsTable
          products={products}
          onEdit={openEdit}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
        />
      </div>

      <ProductForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        product={editingProduct}
      />
    </>
  )
}
