'use client'
import { useState } from 'react'

interface AutomationRule {
  id?: string
  trigger_type: string
  channel: string
  delay_hours: number
  template_body: string
  active: boolean
}

interface Props {
  initialRules: AutomationRule[]
  googleReviewUrl: string | null
  senderName: string | null
  smsCredits: number
}

const TRIGGER_LABELS: Record<string, { icon: string; label: string; desc: string; defaultDelay: number; defaultMsg: string }> = {
  welcome:       { icon: '🆕', label: 'Bienvenue',         desc: 'Après la 1ère commande',             defaultDelay: 1,  defaultMsg: 'Bienvenue {{prenom}} chez {{etablissement}} ! Merci pour ta 1ère visite. À très vite !' },
  birthday:      { icon: '🎂', label: 'Anniversaire',       desc: '2 jours avant le jour J (10h)',      defaultDelay: 48, defaultMsg: 'Joyeux anniversaire {{prenom}} ! Viens fêter ça chez {{etablissement}} — une surprise t\'attend 🎉' },
  reactivation:  { icon: '⚠️', label: 'Réactivation',      desc: 'Client À risque (30j sans visite)',  defaultDelay: 0,  defaultMsg: 'On ne t\'a pas vu depuis un moment {{prenom}} ! Reviens chez {{etablissement}}, tu nous manques ☕' },
  lost:          { icon: '💤', label: 'Client perdu',       desc: 'Client Perdu (60j sans visite)',     defaultDelay: 0,  defaultMsg: '{{prenom}}, ça fait longtemps ! 😢 Reviens chez {{etablissement}} avec une offre spéciale.' },
  google_review: { icon: '⭐', label: 'Avis Google',        desc: '1h après un paiement',               defaultDelay: 1,  defaultMsg: 'Merci pour ta visite chez {{etablissement}} {{prenom}} ! Ton avis nous aide : {{lien_avis}}' },
  tier_upgrade:  { icon: '👑', label: 'Passage de niveau',  desc: 'Lors du passage de tier',            defaultDelay: 0,  defaultMsg: '{{prenom}}, tu viens de passer {{tier}} chez {{etablissement}} 🎉 Bravo !' },
}

export function AutomationRulesForm({ initialRules, googleReviewUrl, senderName, smsCredits }: Props) {
  const [rules, setRules] = useState<Record<string, AutomationRule>>(() => {
    const map: Record<string, AutomationRule> = {}
    for (const r of initialRules) map[r.trigger_type] = r
    return map
  })
  const [saving, setSaving] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function getRule(trigger: string): AutomationRule {
    return rules[trigger] ?? {
      trigger_type:  trigger,
      channel:       'sms',
      delay_hours:   TRIGGER_LABELS[trigger]?.defaultDelay ?? 0,
      template_body: TRIGGER_LABELS[trigger]?.defaultMsg ?? '',
      active:        false,
    }
  }

  async function saveRule(trigger: string) {
    const rule = getRule(trigger)
    setSaving(trigger)
    setErrors(prev => ({ ...prev, [trigger]: '' }))

    const res = await fetch('/api/automation-rules', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rule),
    })
    setSaving(null)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setErrors(prev => ({ ...prev, [trigger]: data.error ?? 'Erreur' }))
      return
    }
    const saved = await res.json() as AutomationRule
    setRules(prev => ({ ...prev, [trigger]: saved }))
  }

  function update(trigger: string, field: keyof AutomationRule, value: unknown) {
    setRules(prev => ({
      ...prev,
      [trigger]: { ...getRule(trigger), [field]: value },
    }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Setup warnings */}
      {smsCredits <= 0 && (
        <div className="p-3 rounded-lg text-sm text-amber-300" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          ⚠️ Crédits SMS épuisés — contactez Alloflow pour recharger
        </div>
      )}
      {(!senderName || !googleReviewUrl) && (
        <div className="p-3 rounded-lg text-sm text-blue-300" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
          📡 Configurez votre <a href="/dashboard/settings" className="underline">nom expéditeur SMS et lien Google</a> pour activer les automations.
        </div>
      )}

      {Object.entries(TRIGGER_LABELS).map(([trigger, meta]) => {
        const rule = getRule(trigger)
        const isStub = trigger === 'tier_upgrade'
        return (
          <div
            key={trigger}
            className="rounded-[12px] p-4"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              opacity: isStub ? 0.6 : 1,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--text1)]">{meta.icon} {meta.label}</div>
                  <div className="text-xs text-[var(--text3)]">{meta.desc}</div>
                </div>
                {isStub && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text3)' }}
                  >
                    Bientôt
                  </span>
                )}
              </div>
              <label className={`flex items-center gap-2 ${isStub ? 'pointer-events-none' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={rule.active}
                  onChange={e => update(trigger, 'active', e.target.checked)}
                  disabled={isStub}
                  className="w-4 h-4 rounded accent-[var(--blue)]"
                />
                <span className="text-xs text-[var(--text2)]">{rule.active ? 'Actif' : 'Inactif'}</span>
              </label>
            </div>

            <textarea
              value={rule.template_body}
              onChange={e => update(trigger, 'template_body', e.target.value)}
              rows={2}
              maxLength={160}
              disabled={isStub}
              className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] resize-none mb-1 disabled:opacity-60"
              placeholder="Votre message avec {{prenom}}, {{etablissement}}, {{points}}..."
            />
            <div className="text-right text-[10px] text-[var(--text4)] mb-3">{rule.template_body.length}/160</div>

            {errors[trigger] && <p className="text-xs text-red-400 mb-2">{errors[trigger]}</p>}

            <button
              onClick={() => saveRule(trigger)}
              disabled={saving === trigger || isStub}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}
            >
              {saving === trigger ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
