import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FranchisesPageClient } from './_components/franchises-page-client'

export default async function FranchisesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  const res = await fetch(`${baseUrl}/api/franchise/establishments`, {
    headers: { Cookie: cookieStr },
    cache: 'no-store',
  })

  const data = res.ok ? await res.json() : { establishments: [] }

  return <FranchisesPageClient initialEstablishments={data.establishments} />
}
