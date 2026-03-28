// src/app/dashboard/franchise/loyalty/page.tsx
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let config: NetworkConfig = DEFAULT_CONFIG
  try {
    const res = await fetch(`${baseUrl}/api/loyalty/network-config`, {
      headers: { Cookie: cookieStr },
      cache: 'no-store',
    })
    if (res.ok) config = await res.json()
  } catch {
    // use defaults
  }

  return <NetworkLoyaltyClient initialConfig={config} />
}
