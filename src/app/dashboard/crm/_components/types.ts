// src/app/dashboard/crm/_components/types.ts

export interface Customer {
  id: string
  first_name: string
  last_name: string | null
  tier: 'standard' | 'silver' | 'gold'
  points: number
  phone: string | null
  email: string | null
  created_at: string
}

export interface CrmStats {
  totalCustomers: number
  goldCount: number
  silverCount: number
  ptsDistributedThisMonth: number
  rewardsUsedThisMonth: number
}
