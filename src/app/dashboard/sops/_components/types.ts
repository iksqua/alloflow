export interface SopCategory {
  id: string
  establishment_id: string
  name: string
  emoji: string | null
  sort_order: number
}

export interface SopStep {
  id: string
  sop_id: string
  sort_order: number
  title: string
  description: string
  duration_seconds: number | null
  media_url: string | null
  note_type: 'warning' | 'tip' | null
  note_text: string | null
}

export interface Sop {
  id: string
  title: string
  content: string | null
  category_id: string | null
  recipe_id: string | null
  active: boolean
  category: { id: string; name: string; emoji: string | null } | null
  recipe: { id: string; title: string } | null
  // computed
  step_count: number
  total_duration_seconds: number
  has_video: boolean
}

export interface SopWithSteps extends Sop {
  steps: SopStep[]
}
