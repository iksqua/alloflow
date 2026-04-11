// src/app/dashboard/fiscal/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FiscalPageClient } from './_components/fiscal-page-client'

export default async function FiscalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  const { data: entries } = await supabase
    .from('fiscal_journal_entries')
    .select('*, order:orders(id, status)')
    .eq('establishment_id', profile.establishment_id)
    .order('sequence_no', { ascending: false })
    .limit(50)

  type FiscalEntryRow = NonNullable<typeof entries>[number] & { event_type: 'sale' | 'void' | 'refund' | 'z_close' }
  return <FiscalPageClient initialEntries={(entries ?? []) as FiscalEntryRow[]} />
}
