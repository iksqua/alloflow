// src/app/api/sops/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSopSchema } from '@/lib/validations/sop'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')
  const search     = searchParams.get('search')

  let query = supabase
    .from('sops')
    .select(`
      id, title, content, category_id, recipe_id, active,
      category:sop_categories(id, name, emoji),
      recipe:recipes(id, title),
      steps:sop_steps(id, sop_id, sort_order, title, description, duration_seconds, media_url, note_type, note_text)
    `)
    .eq('establishment_id', establishmentId)
    .eq('active', true)
    .order('title')

  if (categoryId) query = query.eq('category_id', categoryId)
  if (search)     query = query.ilike('title', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute derived fields
  const sops = (data ?? []).map(s => ({
    ...s,
    step_count:             (s.steps ?? []).length,
    total_duration_seconds: (s.steps ?? []).reduce((sum: number, step: { duration_seconds: number | null }) => sum + (step.duration_seconds ?? 0), 0),
    has_video:              (s.steps ?? []).some((step: { media_url: string | null }) => !!step.media_url),
  }))

  return NextResponse.json({ sops })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createSopSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { title, content, category_id, recipe_id, steps } = result.data

  const { data: sop, error: sopError } = await supabase
    .from('sops')
    .insert({ establishment_id: establishmentId, title, content: content ?? null, category_id: category_id ?? null, recipe_id: recipe_id ?? null })
    .select()
    .single()

  if (sopError) return NextResponse.json({ error: sopError.message }, { status: 500 })

  if (steps.length > 0) {
    const { error: stepsError } = await supabase.from('sop_steps').insert(
      steps.map(step => ({ sop_id: sop.id, ...step }))
    )
    if (stepsError) {
      await supabase.from('sops').update({ active: false }).eq('id', sop.id)
      return NextResponse.json({ error: 'Erreur création étapes: ' + stepsError.message }, { status: 500 })
    }
  }

  return NextResponse.json(sop, { status: 201 })
}
