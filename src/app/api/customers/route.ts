// src/app/api/customers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCustomerSchema } from '@/lib/validations/loyalty'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  const establishmentId = profile?.establishment_id
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const url = new URL(req.url)
  const tier = url.searchParams.get('tier') // optional filter
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('customers')
    .select('id, first_name, last_name, tier, points, phone, email, created_at')
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (tier && ['standard', 'silver', 'gold'].includes(tier)) {
    query = query.eq('tier', tier)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createCustomerSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('customers')
    .insert({
      establishment_id: establishmentId,
      created_by:       user.id,
      name:             result.data.first_name,
      first_name:       result.data.first_name,
      last_name:        result.data.last_name ?? null,
      phone:            result.data.phone ?? null,
      email:            result.data.email ?? null,
      points:           0,
      tier:             'standard',
      opt_in_sms:       result.data.opt_in_sms ?? false,
      opt_in_email:     result.data.opt_in_email ?? false,
      opt_in_whatsapp:  result.data.opt_in_whatsapp ?? false,
    })
    .select('id, first_name, last_name, phone, email, points, tier')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Network auto-linking: if phone provided, try to link to network_customers
  if (result.data.phone) {
    try {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Resolve org and root_org_id
      const { data: est } = await supabaseAdmin
        .from('establishments')
        .select('org_id')
        .eq('id', establishmentId)
        .single()

      if (est?.org_id) {
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id, type, parent_org_id')
          .eq('id', est.org_id)
          .single()

        if (org && org.type !== 'independent') {
          const rootOrgId: string = (org.parent_org_id ?? org.id) as string

          // Look up existing network_customers for (root_org_id, phone)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existing } = await (supabaseAdmin as any)
            .from('network_customers')
            .select('id')
            .eq('org_id', rootOrgId)
            .eq('phone', result.data.phone)
            .single()

          let networkCustomerId: string

          if (existing) {
            networkCustomerId = existing.id as string
          } else {
            // Create new network_customers record
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: created } = await (supabaseAdmin as any)
              .from('network_customers')
              .insert({
                org_id:     rootOrgId,
                phone:      result.data.phone,
                first_name: result.data.first_name,
                last_name:  result.data.last_name ?? null,
                email:      result.data.email ?? null,
              })
              .select('id')
              .single()

            if (!created) throw new Error('network_customers insert failed')
            networkCustomerId = created.id as string
          }

          // Link the new customer to the network identity
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabaseAdmin as any)
            .from('customers')
            .update({ network_customer_id: networkCustomerId })
            .eq('id', data.id)
        }
      }
    } catch {
      // Auto-linking is best-effort — customer was created successfully, don't fail the request
    }
  }

  return NextResponse.json(data, { status: 201 })
}
