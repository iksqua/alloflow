// src/app/dashboard/crm/analytics/_components/persona-charts.tsx
'use client'

// All fields except total are optional — allows `{ total: 0 }` fallback when no data exists
interface PersonaData {
  total: number
  women_count?: number
  men_count?: number
  other_count?: number
  unknown_count?: number
  avg_age?: number | null
  avg_basket?: number | null
  vip_count?: number
  fidele_count?: number
  nouveau_count?: number
  a_risque_count?: number
  perdu_count?: number
  age_18_25?: number
  age_26_35?: number
  age_36_45?: number
  age_46_55?: number
  age_55_plus?: number
  freq_low?: number
  freq_mid?: number
  freq_high?: number
  avg_basket_women?: number | null
  avg_basket_men?: number | null
}

interface Props { data: PersonaData }

function pct(val: number, total: number) {
  if (!total) return 0
  return Math.round((val / total) * 100)
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = pct(value, total)
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-[var(--text3)] shrink-0 text-right">{label}</div>
      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${p}%`, background: color, minWidth: p > 0 ? '4px' : '0' }}
        />
      </div>
      <div className="w-16 text-xs text-[var(--text2)] font-medium">{value} <span className="text-[var(--text4)]">({p}%)</span></div>
    </div>
  )
}

function StatCard({ value, label, color = 'var(--text1)' }: { value: string; label: string; color?: string }) {
  return (
    <div className="rounded-[12px] p-4 flex flex-col gap-1" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-[var(--text3)]">{label}</div>
    </div>
  )
}

export function PersonaCharts({ data }: Props) {
  const { total } = data
  const atRiskPct = pct((data.a_risque_count ?? 0) + (data.perdu_count ?? 0), total)
  const womenPct  = pct(data.women_count ?? 0, total)
  const menPct    = pct(data.men_count ?? 0, total)

  const segmentData = [
    { label: 'VIP',      value: data.vip_count ?? 0,      color: '#fbbf24' },
    { label: 'Fidèle',   value: data.fidele_count ?? 0,    color: '#10b981' },
    { label: 'Nouveau',  value: data.nouveau_count ?? 0,   color: '#60a5fa' },
    { label: 'À risque', value: data.a_risque_count ?? 0,  color: '#f59e0b' },
    { label: 'Perdu',    value: data.perdu_count ?? 0,     color: '#ef4444' },
  ]

  const ageData = [
    { label: '18–25', value: data.age_18_25 ?? 0 },
    { label: '26–35', value: data.age_26_35 ?? 0 },
    { label: '36–45', value: data.age_36_45 ?? 0 },
    { label: '46–55', value: data.age_46_55 ?? 0 },
    { label: '55+',   value: data.age_55_plus ?? 0 },
  ]
  const ageTotal = ageData.reduce((s, a) => s + a.value, 0)

  const freqData = [
    { label: '1×/mois',   value: data.freq_low ?? 0 },
    { label: '2–3×/mois', value: data.freq_mid ?? 0 },
    { label: '4×+/mois',  value: data.freq_high ?? 0 },
  ]
  const freqTotal = freqData.reduce((s, a) => s + a.value, 0)

  if (!total) {
    return (
      <div className="text-center py-16 text-[var(--text3)]">
        <div className="text-4xl mb-3">📊</div>
        <p>Aucune donnée client pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={`${womenPct}% / ${menPct}%`} label="Femmes / Hommes" color="#a78bfa" />
        <StatCard value={data.avg_age ? `${data.avg_age} ans` : '—'} label="Âge moyen" />
        <StatCard value={`${total}`} label="Clients total" color="#60a5fa" />
        <StatCard value={`${atRiskPct}%`} label="À risque + perdus" color="#f59e0b" />
      </div>

      {/* Segment distribution */}
      <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Distribution des segments</h3>
        <div className="flex flex-col gap-2">
          {segmentData.map(s => (
            <BarRow key={s.label} label={s.label} value={s.value} total={total} color={s.color} />
          ))}
        </div>
      </div>

      {/* Gender donut (CSS) */}
      <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Répartition par genre</h3>
        <div className="flex items-center gap-6">
          {/* Simple horizontal bar as "donut" proxy */}
          <div className="flex-1 h-8 rounded-full overflow-hidden flex">
            {(data.women_count ?? 0) > 0 && (
              <div style={{ width: `${womenPct}%`, background: '#a78bfa' }} title={`Femmes ${womenPct}%`} />
            )}
            {(data.men_count ?? 0) > 0 && (
              <div style={{ width: `${menPct}%`, background: '#60a5fa' }} title={`Hommes ${menPct}%`} />
            )}
            {(total - (data.women_count ?? 0) - (data.men_count ?? 0)) > 0 && (
              <div style={{ flex: 1, background: 'var(--surface)' }} />
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded-full" style={{ background: '#a78bfa' }} /><span className="text-[var(--text2)]">Femmes {womenPct}%</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded-full" style={{ background: '#60a5fa' }} /><span className="text-[var(--text2)]">Hommes {menPct}%</span></div>
            {(data.other_count ?? 0) > 0 && <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded-full" style={{ background: 'var(--surface)' }} /><span className="text-[var(--text2)]">Autre {pct(data.other_count ?? 0, total)}%</span></div>}
          </div>
        </div>
      </div>

      {/* Age distribution */}
      {ageTotal > 0 && (
        <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Tranches d&apos;âge</h3>
          <div className="flex flex-col gap-2">
            {ageData.map(a => (
              <BarRow key={a.label} label={a.label} value={a.value} total={ageTotal} color="#a78bfa" />
            ))}
          </div>
        </div>
      )}

      {/* Visit frequency */}
      {freqTotal > 0 && (
        <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Fréquence de visite</h3>
          <div className="flex flex-col gap-2">
            {freqData.map(f => (
              <BarRow key={f.label} label={f.label} value={f.value} total={freqTotal} color="#10b981" />
            ))}
          </div>
        </div>
      )}

      {/* Avg basket by gender */}
      {(data.avg_basket_women || data.avg_basket_men) && (
        <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Panier moyen par genre</h3>
          <div className="flex gap-4">
            {data.avg_basket_women && (
              <div className="flex-1 text-center p-3 rounded-lg" style={{ background: 'rgba(167,139,250,0.1)' }}>
                <div className="text-lg font-bold text-[#a78bfa]">{data.avg_basket_women.toFixed(2)} €</div>
                <div className="text-xs text-[var(--text3)]">Femmes</div>
              </div>
            )}
            {data.avg_basket_men && (
              <div className="flex-1 text-center p-3 rounded-lg" style={{ background: 'rgba(96,165,250,0.1)' }}>
                <div className="text-lg font-bold text-[#60a5fa]">{data.avg_basket_men.toFixed(2)} €</div>
                <div className="text-xs text-[var(--text3)]">Hommes</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
