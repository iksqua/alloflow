import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateProductSchema } from '@/lib/validations/product'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) {
    return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const result = updateProductSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('products')
    .update(result.data)
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .select('*, category:categories(id, name, color_hex, icon)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Produit non trouvé ou accès refusé' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) {
    return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 403 })
  }

  const { id } = await params

  const { data: deleted, error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Produit non trouvé ou accès refusé' }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
