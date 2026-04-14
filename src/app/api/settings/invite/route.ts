import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const schema = z.object({
  email:      z.string().email(),
  first_name: z.string().min(1).max(50),
  role:       z.enum(['admin', 'caissier']),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id, org_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role as string))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // inviteUserByEmail sends a magic link email.
  // raw_user_meta_data is read by the handle_new_user trigger to create the profile.
  const { data: { user: invitedUser }, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(body.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/confirm`,
    data: {
      first_name:       body.data.first_name,
      role:             body.data.role,
      establishment_id: profile.establishment_id,
      org_id:           profile.org_id ?? null,
    },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Upsert profile to handle re-inviting existing users (trigger only fires for new users)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any)
    .from('profiles')
    .upsert(
      {
        id:               invitedUser!.id,
        role:             body.data.role,
        establishment_id: profile.establishment_id,
        org_id:           profile.org_id ?? null,
        first_name:       body.data.first_name,
      },
      { onConflict: 'id' }
    )

  return NextResponse.json({ ok: true }, { status: 201 })
}
