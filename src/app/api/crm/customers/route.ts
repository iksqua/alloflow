// src/app/api/crm/customers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) {
    return NextResponse.json({ error: 'No establishment' }, { status: 403 })
  }

  const body = await req.json()

  // Enforce establishment_id from session, not client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('customers')
    .insert({
      establishment_id: profile.establishment_id,
      name:         body.name,
      first_name:   body.first_name,
      last_name:    body.last_name ?? null,
      phone:        body.phone ?? null,
      email:        body.email ?? null,
      gender:       body.gender ?? null,
      birthdate:    body.birthdate ?? null,
      opt_in_sms:   body.opt_in_sms ?? false,
      opt_in_email: body.opt_in_email ?? false,
      rfm_segment:  'nouveau',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
