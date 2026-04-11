// src/app/api/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const createCampaignSchema = z.object({
  name:           z.string().min(1).max(100),
  channel:        z.enum(['sms', 'whatsapp', 'email']),
  template_body:  z.string().min(1).max(160),
  segment_filter: z.object({
    segments: z.array(z.enum(['vip', 'fidele', 'nouveau', 'a_risque', 'perdu'])).optional(),
    tags:     z.array(z.string()).optional(),
  }).optional(),
  scheduled_at:   z.string().datetime().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ campaigns: [] })

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, type, channel, status, scheduled_at, sent_at, sent_count, delivered_count, created_at')
    .eq('establishment_id', profile.establishment_id)
    .eq('type', 'manual')
    .order('created_at', { ascending: false })

  return NextResponse.json({ campaigns: campaigns ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = createCampaignSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { name, channel, template_body, segment_filter, scheduled_at } = body.data

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      establishment_id: profile.establishment_id,
      name,
      type:          'manual',
      channel,
      template_body,
      segment_filter: segment_filter ?? {},
      status:         scheduled_at ? 'scheduled' : 'draft',
      scheduled_at:   scheduled_at ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: 'Création échouée' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
