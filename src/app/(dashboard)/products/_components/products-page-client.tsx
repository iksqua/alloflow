'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProductsTable } from './products-table'
import { ProductForm } from './product-form'

type Product = {
  id: string
  name: string
  price: number
  category: string
  tva_rate: number
  active: boolean
}

export function ProductsPageClient({ initialProducts }: { initialProducts: Product[] }) {
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

  async function handleSave(data: Omit<Product, 'id' | 'active'>) {
    if (editingProduct) {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la modification')
    } else {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la création')
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

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>+ Nouveau produit</Button>
      </div>

      <div className="bg-white rounded-lg border">
        <ProductsTable
          products={products}
          onEdit={openEdit}
          onDelete={handleDelete}
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
