import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FicheClient } from './_components/fiche-client'

export default async function FicheFranchisePage({
  params,
}: {
  params: Promise<{ establishmentId: string }>
}) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let contract = null
  try {
    const res = await fetch(`${baseUrl}/api/franchise/contracts/${establishmentId}`, {
      headers: { Cookie: cookieStr },
      cache: 'no-store',
    })
    if (res.ok) ({ contract } = await res.json())
    else redirect('/dashboard/franchise/franchises')
  } catch {
    redirect('/dashboard/franchise/franchises')
  }

  return <FicheClient establishmentId={establishmentId} initialContract={contract} />
}
