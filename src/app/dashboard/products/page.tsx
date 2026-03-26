import { createClient } from '@/lib/supabase/server'
import { ProductsPageClient } from './_components/products-page-client'
import type { Category } from './_components/types'

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

  const { data: categoriesData } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order')

  const categories: Category[] = categoriesData ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Produits</h2>
      </div>
      <ProductsPageClient initialProducts={products ?? []} categories={categories} />
    </div>
  )
}
