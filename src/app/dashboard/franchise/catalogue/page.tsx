import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CataloguePageClient } from './_components/catalogue-page-client'

export default async function CataloguePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let items: unknown[] = []
  try {
    const res = await fetch(`${baseUrl}/api/franchise/catalogue`, {
      headers: { Cookie: cookieStr },
      cache: 'no-store',
    })
    if (res.ok) ({ items } = await res.json())
  } catch { /* use defaults */ }

  return <CataloguePageClient initialItems={items} />
}
