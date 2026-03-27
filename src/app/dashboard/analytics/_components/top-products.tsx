import type { TopProduct } from '@/lib/analytics/types'

interface TopProductsProps {
  data: TopProduct[]
}

export function TopProducts({ data }: TopProductsProps) {
  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Top produits</h3>

      {data.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">Aucune vente sur cette période</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((product, index) => (
            <div key={product.productId} className="flex items-center gap-3">
              {/* Rank circle */}
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-blue-400">{index + 1}</span>
              </div>

              {/* Name + stats */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-200 truncate">{product.productName}</span>
                  <span className="text-xs text-slate-400 ml-2 flex-shrink-0">{product.pct}%</span>
                </div>
                <div className="text-[10px] text-slate-500 mb-1">
                  {product.qtySold} vendu{product.qtySold > 1 ? 's' : ''} · {product.caTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </div>
                {/* Progress bar */}
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${product.pct}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
