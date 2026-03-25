import { createClient } from '@/lib/supabase/server'
import { ProductsPageClient } from './_components/products-page-client'

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: products = [] } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .order('name')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Produits</h2>
      </div>
      <ProductsPageClient initialProducts={products ?? []} />
    </div>
  )
}
