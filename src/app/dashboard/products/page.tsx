import { createClient } from '@/lib/supabase/server'
import { ProductsPageClient } from './_components/products-page-client'
import type { Product, Category } from './_components/types'

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  let query = supabase
    .from('products')
    .select('*, category:categories(id, name, color_hex, icon)')
    .is('deleted_at', null)

  if (profile?.role !== 'super_admin' && profile?.establishment_id) {
    query = query.eq('establishment_id', profile.establishment_id)
  }

  const { data: products = [] } = await query.order('sort_order').order('name')

  let catQuery = supabase.from('categories').select('*').order('sort_order')
  if (profile?.role !== 'super_admin' && profile?.establishment_id) {
    catQuery = catQuery.eq('establishment_id', profile.establishment_id)
  }
  const { data: categoriesData } = await catQuery

  const categories: Category[] = categoriesData ?? []

  const isEmpty = (products ?? []).length === 0 && categories.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Produits</h2>
      </div>

      {isEmpty && (
        <div
          className="mb-6 p-5 rounded-xl"
          style={{ background: 'linear-gradient(135deg, #0f1f35 0%, #1a2d4a 100%)', border: '1px solid #1e3a5f' }}
        >
          <p className="text-base font-semibold text-white mb-1">Bienvenue sur Alloflow 👋</p>
          <p className="text-sm mb-4" style={{ color: '#93c5fd' }}>
            Votre espace est prêt. Voici par où commencer :
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href="/dashboard/catalogue-reseau"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium text-center transition-colors"
              style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid #2d5a8e' }}
            >
              📦 Voir le catalogue réseau
            </a>
            <a
              href="/dashboard/settings/etablissement"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium text-center transition-colors"
              style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid #2d5a8e' }}
            >
              🏪 Configurer mon établissement
            </a>
            <a
              href="/dashboard/stocks"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium text-center transition-colors"
              style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid #2d5a8e' }}
            >
              📊 Voir mes stocks
            </a>
          </div>
        </div>
      )}

      <ProductsPageClient initialProducts={(products ?? []) as unknown as Product[]} initialCategories={categories} />
    </div>
  )
}
