import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from './_components/sidebar'
import { CaisseButton } from './_components/caisse-button'
import { ThemeToggle } from './_components/theme-toggle'

async function signOut() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, establishment_id, org_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login?error=profile_not_found')
  if (profile.role === 'franchise_admin') return <>{children}</>
  if (profile.role === 'caissier') redirect('/caisse/pos')

  const { data: establishment } = profile.establishment_id
    ? await supabase
        .from('establishments')
        .select('name')
        .eq('id', profile.establishment_id)
        .single()
    : { data: null }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar
        userName={user.email?.split('@')[0] ?? 'Utilisateur'}
        userRole={profile.role}
        establishmentName={establishment?.name}
      />
      {/* Main area — responsive offset matching sidebar width */}
      <div className="md:ml-[60px] lg:ml-[220px]" style={{ paddingTop: '48px' }}>
        <header
          className="fixed top-0 right-0 h-12 flex items-center justify-between pl-14 pr-4 md:px-6 border-b border-[var(--border)] z-10 left-0 md:left-[60px] lg:left-[220px]"
          style={{ background: 'var(--header-bg)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        >
          <span />
          <div className="flex items-center gap-4">
            <CaisseButton />
            <ThemeToggle />
            <form action={signOut}>
              <button type="submit" className="text-xs text-[var(--text3)] hover:text-[var(--text1)]">
                Déconnexion
              </button>
            </form>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
