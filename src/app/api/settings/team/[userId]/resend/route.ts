import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role as string))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // Cross-tenant check: verify target belongs to caller's establishment
  const { data: target } = await supabase
    .from('profiles').select('establishment_id').eq('id', userId).single()
  if (!target || target.establishment_id !== profile.establishment_id)
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user: targetUser }, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (fetchError || !targetUser) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

  // inviteUserByEmail is idempotent — resends the magic link
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(targetUser.email!, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
