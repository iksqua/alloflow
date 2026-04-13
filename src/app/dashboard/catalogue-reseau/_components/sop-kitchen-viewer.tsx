'use client'
import { useState } from 'react'
import { SopKitchenMode } from '@/app/dashboard/sops/_components/sop-kitchen-mode'
import type { SopWithSteps } from '@/app/dashboard/sops/_components/types'

type PayloadStep = {
  sort_order?: number
  title: string
  description: string
  duration_seconds?: number | null
  media_url?: string | null
  note_type?: 'warning' | 'tip' | null
  note_text?: string | null
}

function payloadToSopWithSteps(id: string, name: string, payload: Record<string, unknown>): SopWithSteps {
  const rawSteps = (payload?.steps ?? []) as PayloadStep[]
  const steps = rawSteps.map((s, i) => ({
    id:               `${id}-${i}`,
    sop_id:           id,
    sort_order:       s.sort_order ?? i,
    title:            s.title,
    description:      s.description,
    duration_seconds: s.duration_seconds ?? null,
    media_url:        s.media_url ?? null,
    note_type:        s.note_type ?? null,
    note_text:        s.note_text ?? null,
  }))

  return {
    id,
    title:                   name,
    content:                 null,
    category_id:             null,
    recipe_id:               null,
    active:                  true,
    category:                null,
    recipe:                  null,
    step_count:              steps.length,
    total_duration_seconds:  steps.reduce((acc, s) => acc + (s.duration_seconds ?? 0), 0),
    has_video:               steps.some(s => !!s.media_url),
    steps,
  }
}

export function SopKitchenViewer({
  id, name, payload,
}: {
  id: string
  name: string
  payload: Record<string, unknown>
}) {
  const [open, setOpen] = useState(false)
  const steps = (payload?.steps ?? []) as PayloadStep[]

  if (steps.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg font-medium text-white flex-shrink-0"
        style={{ background: 'var(--blue)' }}
      >
        ▶ Voir le guide
      </button>
      {open && (
        <SopKitchenMode
          sop={payloadToSopWithSteps(id, name, payload)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
