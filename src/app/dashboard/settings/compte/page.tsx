import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountForm } from '../_components/account-form'

export default async function ComptePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-[var(--text1)] mb-6">Mon compte</h1>
      <AccountForm
        email={user.email ?? ''}
        firstName={profile?.first_name ?? ''}
      />
    </div>
  )
}
