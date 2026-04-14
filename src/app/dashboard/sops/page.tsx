import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SopsPageClient } from './_components/sops-page-client'
import type { Sop, SopCategory } from './_components/types'

export default async function SopsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/dashboard')

  const [sopsRes, catsRes, recipesRes] = await Promise.all([
    supabase
      .from('sops')
      .select(`
        id, title, content, category_id, recipe_id, active,
        category:sop_categories(id, name, emoji),
        recipe:recipes(id, title),
        steps:sop_steps(id, sort_order, duration_seconds, media_url)
      `)
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('title'),
    supabase
      .from('sop_categories')
      .select('*')
      .eq('establishment_id', profile.establishment_id)
      .order('sort_order'),
    supabase
      .from('recipes')
      .select('id, title')
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('title'),
  ])

  const sops: Sop[] = (sopsRes.data ?? []).map(s => ({
    ...s,
    category: Array.isArray(s.category) ? s.category[0] ?? null : s.category,
    recipe:   Array.isArray(s.recipe)   ? s.recipe[0]   ?? null : s.recipe,
    step_count:             (s.steps ?? []).length,
    total_duration_seconds: (s.steps ?? []).reduce((sum: number, step: { duration_seconds: number | null }) => sum + (step.duration_seconds ?? 0), 0),
    has_video:              (s.steps ?? []).some((step: { media_url: string | null }) => !!step.media_url),
  }))

  // Seed categories if none exist (new establishment)
  let categories = (catsRes.data ?? []) as SopCategory[]
  if (categories.length === 0) {
    const seeds = [
      { establishment_id: profile.establishment_id, name: 'Recettes & Production', emoji: '🍳', sort_order: 0 },
      { establishment_id: profile.establishment_id, name: 'Hygiène & HACCP',       emoji: '🧼', sort_order: 1 },
      { establishment_id: profile.establishment_id, name: 'Tenue & Comportement',  emoji: '👕', sort_order: 2 },
      { establishment_id: profile.establishment_id, name: 'Nettoyage & Entretien', emoji: '🧹', sort_order: 3 },
      { establishment_id: profile.establishment_id, name: 'Rôle & Accueil',        emoji: '👤', sort_order: 4 },
      { establishment_id: profile.establishment_id, name: 'Réception & Stocks',    emoji: '📦', sort_order: 5 },
    ]
    const { data: seeded } = await supabase.from('sop_categories').insert(seeds).select()
    categories = (seeded ?? []) as SopCategory[]
  }

  return (
    <SopsPageClient
      initialSops={sops}
      initialCategories={categories}
      recipes={(recipesRes.data ?? []) as { id: string; title: string }[]}
    />
  )
}
