import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PilotagePageClient } from './_components/pilotage-page-client'

interface Establishment {
  id: string
  name: string
  type: 'own' | 'franchise'
  royalty_rate: number
  marketing_rate: number
  start_date: string | null
  status: 'actif' | 'invitation_envoyee'
}

export default async function PilotagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['franchise_admin', 'super_admin'].includes(profile.role)) redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let establishments: Establishment[] = []
  try {
    const res = await fetch(`${baseUrl}/api/franchise/establishments`, {
      headers: { Cookie: cookieStr },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      establishments = data.establishments ?? []
    }
  } catch {
    // use defaults
  }

  return <PilotagePageClient establishments={establishments} />
}
