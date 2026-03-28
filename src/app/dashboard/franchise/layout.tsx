import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FranchiseSidebar } from './_components/franchise-sidebar'

export default async function FranchiseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  return (
    <div className="flex flex-1 min-h-0">
      <FranchiseSidebar />
      <main className="flex-1 overflow-y-auto py-8 px-6">
        {children}
      </main>
    </div>
  )
}
