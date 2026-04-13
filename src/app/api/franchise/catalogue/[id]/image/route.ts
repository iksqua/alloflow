import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return { error: 403 as const }
  return { userId: user.id, orgId: profile.org_id as string }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 422 })
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Format non supporté (jpg, png, webp)' }, { status: 422 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'Fichier trop volumineux (max 2 Mo)' }, { status: 422 })

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const path = `${caller.orgId}/${id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('catalogue-images').upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('catalogue-images').getPublicUrl(path)
  const { error: updateErr } = await supabase.from('network_catalog_items').update({ image_url: publicUrl }).eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ image_url: publicUrl })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.storage.from('catalogue-images')
    .remove([`${caller.orgId}/${id}.jpg`, `${caller.orgId}/${id}.png`, `${caller.orgId}/${id}.webp`])

  const { error: clearErr } = await supabase.from('network_catalog_items').update({ image_url: null }).eq('id', id)
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
