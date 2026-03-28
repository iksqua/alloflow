import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const schema = z.object({
  networkName: z.string().min(2).max(80),
  email:       z.string().email(),
  password:    z.string().min(8),
})

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { networkName, email, password } = body.data

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Create org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org, error: orgError } = await (supabaseAdmin as any)
    .from('organizations')
    .insert({ name: networkName, type: 'siege' })
    .select()
    .single()

  if (orgError) return NextResponse.json({ error: 'Erreur lors de la création du réseau' }, { status: 500 })

  // 2. Create user — trigger handle_new_user creates profile from user_metadata
  const { error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role:   'franchise_admin',
      org_id: org.id,
    },
  })

  if (userError) {
    // Cleanup orphaned org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from('organizations').delete().eq('id', org.id)

    const isAlreadyRegistered = userError.message?.toLowerCase().includes('already registered')
      || userError.message?.toLowerCase().includes('already been registered')
    if (isAlreadyRegistered) {
      return NextResponse.json({ error: 'Un compte existe déjà avec cet email' }, { status: 409 })
    }
    console.error('[register-franchise] user creation error:', userError)
    return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
