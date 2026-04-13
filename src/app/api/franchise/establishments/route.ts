import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const onboardingSchema = z.object({
  company_name:       z.string().min(1).max(100),
  shop_name:          z.string().min(1).max(100),
  manager_email:      z.string().email(),
  manager_first_name: z.string().min(1).max(50),
  royalty_rate:       z.number().min(0).max(50),
  marketing_rate:     z.number().min(0).max(20),
  start_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

async function getFranchiseAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id }
}

export async function GET() {
  const caller = await getFranchiseAdminProfile()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {

  // All orgs in network
  const { data: networkOrgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name, type')
    .or(`id.eq.${caller.orgId},parent_org_id.eq.${caller.orgId}`)

  const orgIds = (networkOrgs ?? []).map((o: { id: string }) => o.id)

  const { data: establishments } = await supabaseAdmin
    .from('establishments')
    .select('id, name, org_id')
    .in('org_id', orgIds.length > 0 ? orgIds : ['__none__'])

  const { data: contracts } = await supabaseAdmin
    .from('franchise_contracts')
    .select('establishment_id, royalty_rate, marketing_rate, start_date')
    .eq('org_id', caller.orgId)

  const contractMap = new Map(
    (contracts ?? []).map((c: { establishment_id: string; royalty_rate: number; marketing_rate: number; start_date: string }) => [
      c.establishment_id,
      c,
    ])
  )

  const orgsMap = new Map((networkOrgs ?? []).map((o: { id: string; type: string }) => [o.id, o]))

  // Get admin profiles for each establishment (to retrieve their user IDs)
  const { data: adminProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, establishment_id')
    .in('establishment_id', (establishments ?? []).map((e: { id: string }) => e.id))
    .eq('role', 'admin')

  // Get last_sign_in_at from auth.users (NOT from profiles — it's an auth.users field)
  const adminProfileIds = (adminProfiles ?? []).map((p: { id: string }) => p.id)
  let authUsersMap = new Map<string, string | null>()
  if (adminProfileIds.length > 0) {
    const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    authUsersMap = new Map(
      authUsers
        .filter(u => adminProfileIds.includes(u.id))
        .map(u => [u.id, u.last_sign_in_at ?? null])
    )
  }

  // Map establishment_id → last_sign_in_at
  const estLastSignIn = new Map<string, string | null>()
  for (const p of (adminProfiles ?? []) as Array<{ id: string; establishment_id: string }>) {
    estLastSignIn.set(p.establishment_id, authUsersMap.get(p.id) ?? null)
  }

  const result = (establishments ?? []).map((est: { id: string; name: string; org_id: string }) => {
    const org           = orgsMap.get(est.org_id)
    const contract      = contractMap.get(est.id)
    const lastSignIn    = estLastSignIn.get(est.id) ?? null
    return {
      id:             est.id,
      name:           est.name,
      type:           org?.type === 'franchise' ? 'franchise' : 'own',
      royalty_rate:   contract?.royalty_rate   ?? 0,
      marketing_rate: contract?.marketing_rate ?? 0,
      start_date:     contract?.start_date     ?? null,
      status:         lastSignIn ? 'actif' : 'invitation_envoyee',
    }
  })

  return NextResponse.json({ establishments: result })

  } catch (err) {
    console.error('[franchise/establishments GET] Unexpected error:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const caller = await getFranchiseAdminProfile()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = onboardingSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { company_name, shop_name, manager_email, manager_first_name, royalty_rate, marketing_rate, start_date } = body.data

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let franchiseeOrgId: string | null = null
  let establishmentId: string | null = null
  let invitedUserId:   string | null = null

  try {
    // Step 1: Create franchisee org
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({ name: company_name, type: 'franchise', parent_org_id: caller.orgId })
      .select('id')
      .single()
    if (orgErr || !org) throw new Error(orgErr?.message ?? 'Failed to create org')
    franchiseeOrgId = org.id

    // Step 2: Create establishment
    const { data: est, error: estErr } = await supabaseAdmin
      .from('establishments')
      .insert({ name: shop_name, org_id: franchiseeOrgId })
      .select('id')
      .single()
    if (estErr || !est) throw new Error(estErr?.message ?? 'Failed to create establishment')
    establishmentId = est.id

    // Step 3: Create franchise contract
    const { error: contractErr } = await supabaseAdmin
      .from('franchise_contracts')
      .insert({ org_id: caller.orgId, establishment_id: establishmentId, royalty_rate, marketing_rate, start_date })
    if (contractErr) throw new Error(contractErr.message)

    // Step 4: Invite manager
    const { data: { user: invitedUser }, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      manager_email,
      { data: { role: 'admin', establishment_id: establishmentId, org_id: franchiseeOrgId, first_name: manager_first_name } }
    )
    if (inviteErr || !invitedUser) throw new Error(inviteErr?.message ?? 'Failed to invite user')
    invitedUserId = invitedUser.id

    // Step 5: Upsert profile immediately (handle_new_user fires only on password confirmation)
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id:               invitedUserId,
          first_name:       manager_first_name,
          role:             'admin',
          establishment_id: establishmentId,
          org_id:           franchiseeOrgId,
        },
        { onConflict: 'id' }
      )
    if (profileErr) throw new Error(profileErr.message)

    // Step 6: Seed catalogue — insère tous les items publiés du siège dans le nouvel établissement
    const { data: catalogItems } = await supabaseAdmin
      .from('network_catalog_items')
      .select('id, version')
      .eq('org_id', caller.orgId)
      .eq('status', 'published')

    if (catalogItems && catalogItems.length > 0 && establishmentId) {
      const catalogRows = (catalogItems as Array<{ id: string; version: number }>).map(item => ({
        establishment_id: establishmentId,
        catalog_item_id:  item.id,
        is_active:        true,
        current_version:  item.version,
      }))
      await supabaseAdmin
        .from('establishment_catalog_items')
        .upsert(catalogRows, { onConflict: 'establishment_id,catalog_item_id' })
        .then(() => null, () => null) // non-blocking — onboarding proceeds even if catalog seed fails
    }

    // Step 7: Seed stock_items from published network ingredients
    const { data: networkIngredients } = await supabaseAdmin
      .from('network_catalog_items')
      .select('id, name, network_catalog_item_data(payload)')
      .eq('org_id', caller.orgId)
      .eq('type', 'ingredient')
      .eq('status', 'published')

    if (networkIngredients && networkIngredients.length > 0 && establishmentId) {
      const stockRows = (networkIngredients as Array<{
        id: string
        name: string
        network_catalog_item_data: { payload: { unit?: string; reference_package_price?: number; reference_package_size?: number } } | Array<{ payload: { unit?: string; reference_package_price?: number; reference_package_size?: number } }> | null
      }>).map(ing => {
        const data = Array.isArray(ing.network_catalog_item_data)
          ? ing.network_catalog_item_data[0]
          : ing.network_catalog_item_data
        const payload = data?.payload

        const refPrice = payload?.reference_package_price
        const refSize  = payload?.reference_package_size
        const unit_price =
          refPrice && refSize
            ? Math.round(refPrice / refSize * 1e6) / 1e6
            : undefined

        return {
          establishment_id: establishmentId,
          name:             ing.name,
          unit:             payload?.unit ?? 'pièce',
          quantity:         0,
          alert_threshold:  0,
          active:           true,
          ...(unit_price !== undefined ? { unit_price } : {}),
        }
      })
      await supabaseAdmin
        .from('stock_items')
        .upsert(stockRows, { onConflict: 'establishment_id,name', ignoreDuplicates: true })
        .then(() => null, () => null) // non-blocking
    }

    return NextResponse.json({ ok: true, establishment_id: establishmentId }, { status: 201 })

  } catch (err) {
    // Manual rollback in reverse order: profile → auth user → contract → establishment → org
    if (invitedUserId) {
      // deleteUser also removes the auth.users row; the profile row cascades (FK) or was upserted
      await supabaseAdmin.from('profiles').delete().eq('id', invitedUserId).then(() => null, () => null)
      await supabaseAdmin.auth.admin.deleteUser(invitedUserId).catch(() => null)
    }
    if (establishmentId) {
      // Delete contract before establishment (avoids FK issues if cascade not set)
      await supabaseAdmin.from('franchise_contracts').delete().eq('establishment_id', establishmentId).then(() => null, () => null)
      await supabaseAdmin.from('establishments').delete().eq('id', establishmentId).then(() => null, () => null)
    }
    if (franchiseeOrgId) {
      await supabaseAdmin.from('organizations').delete().eq('id', franchiseeOrgId).then(() => null, () => null)
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
