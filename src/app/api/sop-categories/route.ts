// src/app/api/sop-categories/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sopCategorySchema } from '@/lib/validations/sop'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Seed 6 default categories if establishment has none yet
  const { count } = await supabase
    .from('sop_categories')
    .select('*', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)

  if (count === 0) {
    await supabase.from('sop_categories').insert([
      { establishment_id: establishmentId, name: 'Recettes & Production', emoji: '🍳', sort_order: 0 },
      { establishment_id: establishmentId, name: 'Hygiène & HACCP',       emoji: '🧼', sort_order: 1 },
      { establishment_id: establishmentId, name: 'Tenue & Comportement',  emoji: '👕', sort_order: 2 },
      { establishment_id: establishmentId, name: 'Nettoyage & Entretien', emoji: '🧹', sort_order: 3 },
      { establishment_id: establishmentId, name: 'Rôle & Accueil',        emoji: '👤', sort_order: 4 },
      { establishment_id: establishmentId, name: 'Réception & Stocks',    emoji: '📦', sort_order: 5 },
    ])
  }

  const { data, error } = await supabase
    .from('sop_categories')
    .select('*')
    .eq('establishment_id', establishmentId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = sopCategorySchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('sop_categories')
    .insert({ establishment_id: establishmentId, ...result.data })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
