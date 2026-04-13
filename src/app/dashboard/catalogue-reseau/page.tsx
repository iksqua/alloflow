import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CatalogueReseauPageClient } from './_components/catalogue-reseau-page-client'

export default async function CatalogueReseauPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let items: unknown[] = []
  try {
    const res = await fetch(`${baseUrl}/api/catalogue-reseau`, { headers: { Cookie: cookieStr }, cache: 'no-store' })
    if (res.ok) ({ items } = await res.json())
  } catch { /* use defaults */ }

  return <CatalogueReseauPageClient initialItems={items} />
}
