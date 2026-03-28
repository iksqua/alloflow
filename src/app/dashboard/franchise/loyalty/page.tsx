// src/app/dashboard/franchise/loyalty/page.tsx
import { cookies } from 'next/headers'
import { NetworkLoyaltyClient } from './_components/network-loyalty-client'

interface LoyaltyLevel {
  key: string
  name: string
  min: number
  max: number | null
}

interface NetworkConfig {
  active: boolean
  ptsPerEuro: number
  minRedemptionPts: number
  levels: LoyaltyLevel[]
  networkCustomersCount: number
  goldCount: number
  silverCount: number
  points_issued_month: number
}

const DEFAULT_CONFIG: NetworkConfig = {
  active: true,
  ptsPerEuro: 1,
  minRedemptionPts: 100,
  levels: [
    { key: 'standard', name: 'Standard', min: 0,    max: 499  },
    { key: 'silver',   name: 'Silver',   min: 500,  max: 1999 },
    { key: 'gold',     name: 'Gold',     min: 2000, max: null },
  ],
  networkCustomersCount: 0,
  goldCount: 0,
  silverCount: 0,
  points_issued_month: 0,
}

export default async function FranchiseLoyaltyPage() {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')

  let config: NetworkConfig = DEFAULT_CONFIG
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/loyalty/network-config`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.ok) config = await res.json()
  } catch {
    // use defaults
  }

  return <NetworkLoyaltyClient initialConfig={config} />
}
