import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const ruleSchema = z.object({
  trigger_type:  z.enum(['welcome', 'birthday', 'reactivation', 'lost', 'google_review', 'tier_upgrade']),
  channel:       z.enum(['sms', 'whatsapp', 'email']),
  delay_hours:   z.number().int().min(0).max(168),
  template_body: z.string().min(1).max(160),
  active:        z.boolean(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ rules: [] })

  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('establishment_id', profile.establishment_id)
    .order('trigger_type')

  return NextResponse.json({ rules: rules ?? [] })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = ruleSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { data, error } = await supabase
    .from('automation_rules')
    .upsert({
      establishment_id: profile.establishment_id,
      ...body.data,
    }, { onConflict: 'establishment_id,trigger_type' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: 'Sauvegarde échouée' }, { status: 500 })
  return NextResponse.json(data)
}
