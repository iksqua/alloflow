import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const patchSchema = z.object({
  royalty_rate:   z.number().min(0).max(50).optional(),
  marketing_rate: z.number().min(0).max(20).optional(),
  start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ establishmentId: string }> }
) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: contract, error } = await supabaseAdmin
    .from('franchise_contracts')
    .select('royalty_rate, marketing_rate, start_date')
    .eq('org_id', profile.org_id)          // ownership check
    .eq('establishment_id', establishmentId)
    .single()

  if (error || !contract) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

  return NextResponse.json({ contract })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ establishmentId: string }> }
) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = patchSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })
  if (Object.keys(body.data).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: updated, error } = await supabaseAdmin
    .from('franchise_contracts')
    .update(body.data)
    .eq('org_id', profile.org_id)           // ownership check
    .eq('establishment_id', establishmentId)
    .select('royalty_rate, marketing_rate, start_date')
    .single()

  if (error || !updated) return NextResponse.json({ error: 'Contrat introuvable ou non autorisé' }, { status: 404 })

  return NextResponse.json({ contract: updated })
}
