'use client'
import { useState, useEffect } from 'react'
import type { SopCategory, SopStep, SopWithSteps } from './types'

interface StepLine {
  id?: string
  title: string
  description: string
  duration_seconds: string
  media_url: string
  note_type: '' | 'warning' | 'tip'
  note_text: string
}

interface Props {
  open: boolean
  sop: SopWithSteps | null
  categories: SopCategory[]
  recipes: { id: string; title: string }[]
  onClose: () => void
  onSave: () => Promise<void>
}

function toLine(s: SopStep): StepLine {
  return {
    id:               s.id,
    title:            s.title,
    description:      s.description,
    duration_seconds: s.duration_seconds ? String(s.duration_seconds) : '',
    media_url:        s.media_url ?? '',
    note_type:        (s.note_type as StepLine['note_type']) ?? '',
    note_text:        s.note_text ?? '',
  }
}

export function SopForm({ open, sop, categories, recipes, onClose, onSave }: Props) {
  const [title,      setTitle]      = useState('')
  const [content,    setContent]    = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [recipeId,   setRecipeId]   = useState('')
  const [steps,      setSteps]      = useState<StepLine[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(sop?.title ?? '')
      setContent(sop?.content ?? '')
      setCategoryId(sop?.category_id ?? '')
      setRecipeId(sop?.recipe_id ?? '')
      setSteps(sop?.steps?.map(toLine) ?? [])
      setError(null)
    }
  }, [open, sop])

  if (!open) return null

  function addStep() {
    setSteps(prev => [...prev, { title: '', description: '', duration_seconds: '', media_url: '', note_type: '', note_text: '' }])
  }

  function updateStep(idx: number, field: keyof StepLine, value: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx))
  }

  function moveStep(idx: number, direction: -1 | 1) {
    const next = idx + direction
    if (next < 0 || next >= steps.length) return
    setSteps(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Le titre est requis'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        title:       title.trim(),
        content:     content.trim() || null,
        category_id: categoryId || null,
        recipe_id:   recipeId   || null,
        steps: steps
          .filter(s => s.title.trim())
          .map((s, idx) => ({
            ...(s.id ? { id: s.id } : {}),
            sort_order:       idx,
            title:            s.title.trim(),
            description:      s.description.trim(),
            duration_seconds: s.duration_seconds ? parseInt(s.duration_seconds) : null,
            media_url:        s.media_url.trim() || null,
            note_type:        s.note_type || null,
            note_text:        s.note_text.trim() || null,
          })),
      }

      if (sop) {
        // Update metadata
        await fetch(`/api/sops/${sop.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: payload.title, content: payload.content, category_id: payload.category_id, recipe_id: payload.recipe_id }),
        })
        // Replace all steps: delete existing, insert new
        for (const oldStep of sop.steps) {
          await fetch(`/api/sops/${sop.id}/steps/${oldStep.id}`, { method: 'DELETE' })
        }
        for (const step of payload.steps) {
          await fetch(`/api/sops/${sop.id}/steps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(step),
          })
        }
      } else {
        const res = await fetch('/api/sops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur') }
      }

      await onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="text-base font-bold text-[var(--text1)] mb-5">{sop ? 'Modifier le SOP' : 'Nouveau SOP'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* General info */}
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Titre *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nettoyage de la salle"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Catégorie</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm">
                <option value="">— Aucune —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Recette liée</label>
              <select value={recipeId} onChange={e => setRecipeId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm">
                <option value="">— Aucune recette —</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Notes générales</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm resize-none" />
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Étapes</label>
              <button type="button" onClick={addStep}
                className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>+ Ajouter une étape</button>
            </div>

            {steps.length === 0 && (
              <p className="text-xs text-[var(--text4)] text-center py-3 border border-dashed border-[var(--border)] rounded-lg">
                Aucune étape — cliquez sur + Ajouter
              </p>
            )}

            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="rounded-xl border border-[var(--border)] p-3 space-y-2" style={{ background: 'var(--bg)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text4)] w-5">{idx + 1}</span>
                    <input value={step.title} onChange={e => updateStep(idx, 'title', e.target.value)}
                      placeholder="Titre de l'étape"
                      className="flex-1 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs" />
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                        className="text-xs text-[var(--text4)] disabled:opacity-30 px-1">↑</button>
                      <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                        className="text-xs text-[var(--text4)] disabled:opacity-30 px-1">↓</button>
                      <button type="button" onClick={() => removeStep(idx)}
                        className="text-xs text-red-500/60 hover:text-red-400 px-1">✕</button>
                    </div>
                  </div>

                  <textarea value={step.description} onChange={e => updateStep(idx, 'description', e.target.value)}
                    placeholder="Description détaillée de l'étape" rows={2}
                    className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs resize-none" />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[var(--text4)]">Timer (secondes)</label>
                      <input type="number" value={step.duration_seconds} onChange={e => updateStep(idx, 'duration_seconds', e.target.value)}
                        placeholder="ex: 180 = 3 min"
                        className="mt-0.5 w-full px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text4)]">Note</label>
                      <select value={step.note_type} onChange={e => updateStep(idx, 'note_type', e.target.value)}
                        className="mt-0.5 w-full px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs">
                        <option value="">— Aucune —</option>
                        <option value="tip">💡 Conseil</option>
                        <option value="warning">⚠️ Attention</option>
                      </select>
                    </div>
                  </div>

                  {step.note_type && (
                    <input value={step.note_text} onChange={e => updateStep(idx, 'note_text', e.target.value)}
                      placeholder="Texte de la note"
                      className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs" />
                  )}

                  <input value={step.media_url} onChange={e => updateStep(idx, 'media_url', e.target.value)}
                    placeholder="URL vidéo YouTube/Vimeo (optionnel)"
                    className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] text-xs" />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text3)]">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
