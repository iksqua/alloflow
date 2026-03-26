import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function CaisseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login?error=profile_not_found')

  return (
    <div
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: 'var(--bg-caisse)', color: 'var(--text1)' }}
    >
      {children}
    </div>
  )
}
