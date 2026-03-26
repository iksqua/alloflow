import { createClient } from '@/lib/supabase/server'
import { ProductsPageClient } from './_components/products-page-client'

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  let query = supabase.from('products').select('*').eq('active', true)

  if (profile?.role !== 'super_admin' && profile?.establishment_id) {
    query = query.eq('establishment_id', profile.establishment_id)
  }

  const { data: products = [] } = await query.order('name')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Produits</h2>
      </div>
      <ProductsPageClient initialProducts={products ?? []} />
    </div>
  )
}
