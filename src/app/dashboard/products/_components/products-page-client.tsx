'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ProductsStats } from './products-stats'
import { ProductsToolbar } from './products-toolbar'
import { ProductsTable } from './products-table'
import { ProductForm } from './product-form'
import { CategoriesModal } from './categories-modal'
import { BulkActionBar } from './bulk-action-bar'
import { DeleteConfirmModal } from './delete-confirm-modal'
import type { Product, Category, BulkAction } from './types'

interface ProductsPageClientProps {
  initialProducts: Product[]
  initialCategories: Category[]
}

export function ProductsPageClient({ initialProducts, initialCategories }: ProductsPageClientProps) {
  const router = useRouter()

  // Data
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<Category[]>(initialCategories)

  // Filtres (client-side)
  const [search, setSearch] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // Sélection bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modales
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)

  // Filtrage client-side
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterCategoryId && p.category_id !== filterCategoryId) return false
      if (filterStatus === 'active' && !p.is_active) return false
      if (filterStatus === 'inactive' && p.is_active) return false
      return true
    })
  }, [products, search, filterCategoryId, filterStatus])

  // --- Handlers produits ---

  function openCreate() {
    setEditingProduct(null)
    setFormOpen(true)
  }

  function openEdit(product: Product) {
    setEditingProduct(product)
    setFormOpen(true)
  }

  async function handleSave(data: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sort_order' | 'establishment_id' | 'category'>) {
    if (editingProduct) {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la modification')
      const json = await res.json()
      const updated = json.product ?? json
      setProducts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
      toast.success('Produit modifié')
    } else {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la création')
      const json = await res.json()
      const created = json.product ?? json
      setProducts(prev => [...prev, created])
      toast.success('Produit ajouté')
    }
    router.refresh()
    setFormOpen(false)
  }

  async function handleToggleStatus(id: string, active: boolean) {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    })
    if (!res.ok) { toast.error('Erreur de mise à jour'); return }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: active } : p))
  }

  async function handleConfirmDelete() {
    if (!deletingProduct) return
    const res = await fetch(`/api/products/${deletingProduct.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Erreur lors de la suppression'); return }
    setProducts(prev => prev.filter(p => p.id !== deletingProduct.id))
    setDeletingProduct(null)
    toast.success('Produit supprimé')
    router.refresh()
  }

  // --- Handlers bulk ---

  function handleToggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll(ids: string[]) {
    setSelectedIds(new Set(ids))
  }

  async function handleBulkAction(action: BulkAction, extra?: { category_id?: string }) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    const res = await fetch('/api/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, ...extra }),
    })
    if (!res.ok) { toast.error('Erreur lors de l\'action'); return }

    // Mise à jour optimiste
    setProducts(prev => prev.map(p => {
      if (!ids.includes(p.id)) return p
      if (action === 'activate') return { ...p, is_active: true }
      if (action === 'deactivate') return { ...p, is_active: false }
      if (action === 'delete') return { ...p, deleted_at: new Date().toISOString() }
      if (action === 'change_category' && extra?.category_id) return { ...p, category_id: extra.category_id }
      return p
    }).filter(p => action === 'delete' ? !ids.includes(p.id) : true))

    setSelectedIds(new Set())
    toast.success(`Action appliquée à ${ids.length} produit${ids.length > 1 ? 's' : ''}`)
    router.refresh()
  }

  // --- Handlers catégories ---

  async function handleCreateCategory(name: string, color_hex: string, icon: string) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color_hex, icon: icon || null }),
    })
    if (!res.ok) { toast.error('Erreur création catégorie'); return }
    const json = await res.json()
    const created = json.category ?? json
    setCategories(prev => [...prev, created])
    toast.success('Catégorie créée')
  }

  async function handleRenameCategory(id: string, name: string) {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) { toast.error('Erreur renommage'); return }
    const json = await res.json()
    const updated = json.category ?? json
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))
    toast.success('Catégorie renommée')
  }

  async function handleDeleteCategory(id: string) {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json()
      toast.error(json?.error?.message ?? 'Erreur suppression')
      return
    }
    setCategories(prev => prev.filter(c => c.id !== id))
    toast.success('Catégorie supprimée')
  }

  return (
    <>
      {/* Stats */}
      <ProductsStats products={products} />

      {/* Toolbar */}
      <ProductsToolbar
        categories={categories}
        onSearch={setSearch}
        onFilterCategory={setFilterCategoryId}
        onFilterStatus={setFilterStatus}
        onOpenCategories={() => setCategoriesOpen(true)}
      />

      {/* Bouton ajouter + compte */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[var(--text3)]">
          {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''}
          {search || filterCategoryId || filterStatus !== 'all' ? ' (filtré)' : ''}
        </p>
        <button
          onClick={openCreate}
          className="h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style={{ background: 'var(--blue)' }}
        >
          + Nouveau produit
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border border-[var(--border)] overflow-hidden"
        style={{ background: 'var(--surface)' }}
      >
        <ProductsTable
          products={filteredProducts}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onEdit={openEdit}
          onDelete={setDeletingProduct}
          onToggleStatus={handleToggleStatus}
        />
      </div>

      {/* Modales */}
      <ProductForm
        open={formOpen}
        product={editingProduct}
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      {categoriesOpen && (
        <CategoriesModal
          categories={categories}
          onClose={() => setCategoriesOpen(false)}
          onCreate={handleCreateCategory}
          onRename={handleRenameCategory}
          onDelete={handleDeleteCategory}
        />
      )}

      <DeleteConfirmModal
        product={deletingProduct}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingProduct(null)}
      />

      <BulkActionBar
        count={selectedIds.size}
        categories={categories}
        onAction={handleBulkAction}
        onClear={() => setSelectedIds(new Set())}
      />
    </>
  )
}
