'use client'
import { useState, useEffect, useRef } from 'react'
import type { SopWithSteps } from './types'

interface Props {
  sop: SopWithSteps
  onClose: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SopKitchenMode({ sop, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft,   setTimeLeft]   = useState<number | null>(null)
  const [timerActive, setTimerActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const steps = sop.steps.slice().sort((a, b) => a.sort_order - b.sort_order)
  const step  = steps[currentIdx]

  // Reset timer when step changes
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setTimerActive(false)
    setTimeLeft(step?.duration_seconds ?? null)
  }, [currentIdx, step?.duration_seconds])

  // Timer countdown — stable interval using ref
  useEffect(() => {
    if (!timerActive || timeLeft === null) return
    if (timeLeft <= 0) { setTimerActive(false); return }
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t === null || t <= 1) { clearInterval(intervalRef.current!); setTimerActive(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerActive])

  if (!step) return null

  function goNext() {
    if (currentIdx < steps.length - 1) setCurrentIdx(i => i + 1)
  }

  function goPrev() {
    if (currentIdx > 0) setCurrentIdx(i => i - 1)
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]" style={{ background: 'var(--surface2)' }}>
        <div>
          <h1 className="text-base font-bold text-[var(--text1)]">{sop.title}</h1>
          <p className="text-xs text-[var(--text4)]">Étape {currentIdx + 1} sur {steps.length}</p>
        </div>
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--text3)] border border-[var(--border)] hover:bg-[var(--surface)]">
          ✕ Fermer
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[var(--border)]">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${((currentIdx + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Step list + active step */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: step list */}
        <div className="w-60 border-r border-[var(--border)] overflow-y-auto flex-shrink-0 hidden md:block" style={{ background: 'var(--surface2)' }}>
          {steps.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentIdx(idx)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border)]/50 transition-colors ${
                idx === currentIdx ? 'border-l-2 border-l-blue-500' : ''
              } ${idx < currentIdx ? 'opacity-40' : ''}`}
              style={{ background: idx === currentIdx ? 'rgba(29,78,216,.08)' : undefined }}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${idx < currentIdx ? 'text-green-400' : idx === currentIdx ? 'text-blue-400' : 'text-[var(--text4)]'}`}>
                  {idx < currentIdx ? '✓' : idx + 1}
                </span>
                <span className={`text-xs font-medium truncate ${idx === currentIdx ? 'text-[var(--text1)]' : 'text-[var(--text3)]'}`}>
                  {s.title}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Main: active step */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col">
          <div className="max-w-2xl mx-auto w-full">
            {/* Step title */}
            <h2 className="text-2xl font-bold text-[var(--text1)] mb-4">{step.title}</h2>

            {/* Description */}
            {step.description && (
              <p className="text-[var(--text2)] leading-relaxed mb-6 text-base">{step.description}</p>
            )}

            {/* Note */}
            {step.note_type && step.note_text && (
              <div className={`flex gap-3 p-4 rounded-xl mb-6 ${
                step.note_type === 'warning'
                  ? 'bg-amber-900/15 border border-amber-500/30'
                  : 'bg-blue-900/15 border border-blue-500/30'
              }`}>
                <span className="text-xl">{step.note_type === 'warning' ? '⚠️' : '💡'}</span>
                <p className={`text-sm ${step.note_type === 'warning' ? 'text-amber-300' : 'text-blue-300'}`}>
                  {step.note_text}
                </p>
              </div>
            )}

            {/* Video embed */}
            {step.media_url && (
              <div className="mb-6 rounded-xl overflow-hidden border border-[var(--border)]" style={{ aspectRatio: '16/9' }}>
                <iframe
                  src={step.media_url
                    .replace('youtu.be/', 'www.youtube.com/embed/')
                    .replace('watch?v=', 'embed/')}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            )}

            {/* Timer */}
            {step.duration_seconds && (
              <div className="flex items-center gap-4 mb-8">
                <div className="text-4xl font-mono font-bold tabular-nums text-[var(--text1)]">
                  {formatTime(timeLeft ?? step.duration_seconds)}
                </div>
                <button
                  onClick={() => setTimerActive(v => !v)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--border)]"
                  style={{
                    background: timerActive ? 'rgba(239,68,68,.1)' : 'rgba(16,185,129,.1)',
                    color: timerActive ? '#f87171' : '#34d399',
                  }}
                >
                  {timerActive ? '⏸ Pause' : '▶ Démarrer'}
                </button>
                <button onClick={() => setTimeLeft(step.duration_seconds)}
                  className="text-xs text-[var(--text4)] hover:text-[var(--text2)]">↺ Reset</button>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 mt-auto">
              <button onClick={goPrev} disabled={currentIdx === 0}
                className="flex-1 py-3 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text3)] disabled:opacity-30 hover:bg-[var(--surface)]">
                ← Étape précédente
              </button>
              {currentIdx < steps.length - 1 ? (
                <button onClick={goNext}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'var(--blue)' }}>
                  Étape suivante →
                </button>
              ) : (
                <button onClick={onClose}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'var(--green)' }}>
                  ✓ Procédure terminée
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
