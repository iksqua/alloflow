import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (profile.role === null || profile.role === undefined || !['admin', 'super_admin'].includes(profile.role as string))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = await (supabase as any)
    .from('profiles')
    .select('id, role, first_name')
    .eq('establishment_id', profile.establishment_id)

  if (!profiles || profiles.length === 0) return NextResponse.json({ members: [] })

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // listUsers() returns up to 1000 users — sufficient for current team sizes
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })

  const profileIds = new Set(profiles.map((p: { id: string }) => p.id))
  const usersMap = new Map(users.filter(u => profileIds.has(u.id)).map(u => [u.id, u]))

  const members = profiles.map((p: { id: string; role: string; first_name: string }) => {
    const authUser = usersMap.get(p.id)
    return {
      id:              p.id,
      first_name:      p.first_name,
      email:           authUser?.email ?? '',
      role:            p.role,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
    }
  })

  return NextResponse.json({ members })
}
