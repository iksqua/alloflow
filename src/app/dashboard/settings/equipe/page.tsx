import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { TeamPageClient } from '../_components/team-page-client'

export default async function EquipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')
  if (!['admin', 'super_admin'].includes(profile.role as string)) redirect('/dashboard')

  // Charger les membres côté serveur pour le SSR initial (même logique que GET /api/settings/team)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, first_name')
    .eq('establishment_id', profile.establishment_id)

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const profileIds = new Set((profiles ?? []).map((p: { id: string }) => p.id))
  const usersMap   = new Map(users.filter(u => profileIds.has(u.id)).map(u => [u.id, u]))

  const members = (profiles ?? []).map((p: { id: string; role: string; first_name: string }) => {
    const authUser = usersMap.get(p.id)
    return {
      id:              p.id,
      first_name:      p.first_name,
      email:           authUser?.email ?? '',
      role:            p.role,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
    }
  })

  return (
    <div className="max-w-3xl">
      <TeamPageClient initialMembers={members} />
    </div>
  )
}
