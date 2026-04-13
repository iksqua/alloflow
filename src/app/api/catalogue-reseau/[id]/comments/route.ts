import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || !['admin'].includes(profile.role) || !profile.establishment_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { content } = await req.json() as { content?: string }

  if (!content || content.trim().length === 0)
    return NextResponse.json({ error: 'Le commentaire ne peut pas être vide' }, { status: 422 })
  if (content.trim().length > 1000)
    return NextResponse.json({ error: 'Commentaire trop long (max 1000 caractères)' }, { status: 422 })

  // Guard: item must be in this establishment's catalogue
  const { data: membership } = await supabase
    .from('establishment_catalog_items')
    .select('id')
    .eq('catalog_item_id', id)
    .eq('establishment_id', profile.establishment_id)
    .maybeSingle()
  if (!membership)
    return NextResponse.json({ error: 'Item non disponible dans votre catalogue' }, { status: 404 })

  const { error } = await supabase.from('catalog_item_comments').insert({
    catalog_item_id:  id,
    establishment_id: profile.establishment_id,
    author_id:        user.id,
    content:          content.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true }, { status: 201 })
}
