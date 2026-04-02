import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PilotageDetailClient } from './_components/pilotage-detail-client'
import type { Product, Category } from '@/app/dashboard/products/_components/types'
import type { StockItem, PurchaseOrder } from '@/app/dashboard/stocks/_components/types'
import type { Recipe } from '@/app/dashboard/recettes/_components/types'

export default async function PilotageDetailPage({
  params,
}: {
  params: Promise<{ establishmentId: string }>
}) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['franchise_admin', 'super_admin'].includes(profile.role)) redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  const base = `${baseUrl}/api/franchise/establishments/${establishmentId}`
  const headers = { Cookie: cookieStr }
  const opts = { headers, cache: 'no-store' as const }

  // Fetch name/type from establishment list to show the header
  let establishmentName = 'Établissement'

  const [productsRes, stocksRes, recipesRes, estListRes] = await Promise.all([
    fetch(`${base}/products`, opts).then(r => r.ok ? r.json() : null),
    fetch(`${base}/stocks`,   opts).then(r => r.ok ? r.json() : null),
    fetch(`${base}/recipes`,  opts).then(r => r.ok ? r.json() : null),
    fetch(`${baseUrl}/api/franchise/establishments`, opts).then(r => r.ok ? r.json() : null),
  ])

  // 403 / not found: establishment not in this network
  if (!productsRes && !stocksRes && !recipesRes) notFound()

  if (estListRes?.establishments) {
    const found = estListRes.establishments.find((e: { id: string; name: string }) => e.id === establishmentId)
    if (found) establishmentName = found.name
  }

  const initialProducts:   Product[]       = productsRes?.products    ?? []
  const initialCategories: Category[]      = productsRes?.categories  ?? []
  const initialItems:      StockItem[]     = stocksRes?.items         ?? []
  const initialOrders:     PurchaseOrder[] = stocksRes?.orders        ?? []
  const stockCategories                    = stocksRes?.categories     ?? []
  const initialRecipes:    Recipe[]        = recipesRes?.recipes      ?? []
  const recipeCategories                   = recipesRes?.categories    ?? []

  return (
    <PilotageDetailClient
      establishmentId={establishmentId}
      establishmentName={establishmentName}
      initialProducts={initialProducts}
      initialCategories={initialCategories}
      initialItems={initialItems}
      initialOrders={initialOrders}
      stockCategories={stockCategories}
      initialRecipes={initialRecipes}
      recipeCategories={recipeCategories}
    />
  )
}
