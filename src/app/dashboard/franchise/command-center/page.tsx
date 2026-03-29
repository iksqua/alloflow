import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CommandCenterClient } from './_components/command-center-client'

export default async function CommandCenterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch data server-side for initial render
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let data = { network: { ca_yesterday: 0, ca_month: 0, ca_month_prev: 0 }, establishments: [] }
  try {
    const res = await fetch(`${baseUrl}/api/franchise/network-stats`, {
      headers: { Cookie: cookieStr },
      cache: 'no-store',
    })
    if (res.ok) data = await res.json()
  } catch {
    // use defaults
  }

  return <CommandCenterClient initialData={data} />
}
