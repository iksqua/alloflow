import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function DELETE(
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

  const { data: target } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', userId).single()
  if (!target || target.establishment_id !== profile.establishment_id)
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })

  // Protect last admin
  if (['admin', 'super_admin'].includes(target.role as string)) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', profile.establishment_id)
      .in('role', ['admin', 'super_admin'])

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Impossible de retirer le dernier administrateur' },
        { status: 409 }
      )
    }
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any)
    .from('profiles')
    .update({ establishment_id: null })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: 'Opération échouée' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
