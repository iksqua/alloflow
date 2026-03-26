'use client'

interface Product {
  id: string; name: string; emoji: string | null
  price: number; tva_rate: number; category_id: string | null; is_active: boolean
}

interface ProductsPanelProps {
  products: Product[]
  onAdd: (product: Product) => void
}

export function ProductsPanel({ products, onAdd }: ProductsPanelProps) {
  return (
    <div
      className="flex-1 overflow-y-auto p-4"
      style={{ background: 'var(--bg-caisse)' }}
    >
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <span className="text-4xl mb-3 opacity-30">🍽️</span>
          <p className="text-sm text-[var(--text4)]">Aucun produit dans cette catégorie</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => onAdd(product)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl p-4 text-left transition-all hover:scale-[1.02] active:scale-95"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                minHeight: '90px',
              }}
            >
              {product.emoji && (
                <span className="text-3xl">{product.emoji}</span>
              )}
              <span className="text-sm font-medium text-[var(--text1)] text-center leading-tight">
                {product.name}
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--blue)' }}>
                {(product.price * (1 + product.tva_rate / 100)).toFixed(2).replace('.', ',')} €
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
