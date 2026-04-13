'use client'

export type SopStepDraft = {
  id: string
  sort_order: number
  title: string
  description: string
  duration_seconds: number | null
  media_url: string | null
  note_type: 'warning' | 'tip' | null
  note_text: string | null
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}
const labelCls = 'block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5'

function emptyStep(sort_order: number): SopStepDraft {
  return { id: crypto.randomUUID(), sort_order, title: '', description: '', duration_seconds: null, media_url: null, note_type: null, note_text: null }
}

export function SopStepsEditor({
  steps, onChange,
}: {
  steps: SopStepDraft[]
  onChange: (steps: SopStepDraft[]) => void
}) {
  function update(index: number, patch: Partial<SopStepDraft>) {
    onChange(steps.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  function add() {
    onChange([...steps, emptyStep(steps.length)])
  }

  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort_order: i })))
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= steps.length) return
    const arr = [...steps]
    ;[arr[index], arr[next]] = [arr[next], arr[index]]
    onChange(arr.map((s, i) => ({ ...s, sort_order: i })))
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <div key={step.id} className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Étape {i + 1}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="px-2 py-1 rounded text-xs text-[var(--text3)] disabled:opacity-30"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1}
                className="px-2 py-1 rounded text-xs text-[var(--text3)] disabled:opacity-30"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>↓</button>
              <button type="button" onClick={() => remove(i)}
                className="px-2 py-1 rounded text-xs text-red-400 border border-red-900/30 bg-red-900/10">✕</button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className={labelCls}>Titre *</label>
              <input style={inputStyle} value={step.title}
                onChange={e => update(i, { title: e.target.value })} placeholder="Ex: Préchauffer le four" />
            </div>
            <div>
              <label className={labelCls}>Description *</label>
              <textarea style={{ ...inputStyle, height: '64px', resize: 'none' }} value={step.description}
                onChange={e => update(i, { description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Durée (secondes)</label>
                <input type="number" style={inputStyle} min={0}
                  value={step.duration_seconds ?? ''}
                  onChange={e => update(i, { duration_seconds: e.target.value ? Math.max(0, Number(e.target.value)) : null })} />
              </div>
              <div>
                <label className={labelCls}>URL vidéo/image</label>
                <input style={inputStyle} value={step.media_url ?? ''}
                  onChange={e => update(i, { media_url: e.target.value || null })} placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className={labelCls}>Note</label>
              <select style={inputStyle} value={step.note_type ?? ''}
                onChange={e => update(i, { note_type: (e.target.value as 'warning' | 'tip') || null, note_text: e.target.value ? step.note_text : null })}>
                <option value="">Aucune</option>
                <option value="warning">⚠ Attention</option>
                <option value="tip">💡 Conseil</option>
              </select>
            </div>
            {step.note_type && (
              <div>
                <label className={labelCls}>Texte de la note</label>
                <input style={inputStyle} value={step.note_text ?? ''}
                  onChange={e => update(i, { note_text: e.target.value || null })} />
              </div>
            )}
          </div>
        </div>
      ))}

      {steps.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--text4)]">
          Aucune étape — cliquez sur + Ajouter une étape
        </div>
      )}

      <button type="button" onClick={add}
        className="w-full py-2 rounded-xl text-sm text-[var(--text3)] border border-dashed border-[var(--border)] hover:border-[var(--text4)] transition-colors"
        style={{ background: 'transparent' }}>
        + Ajouter une étape
      </button>
    </div>
  )
}
