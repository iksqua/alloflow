'use client'

interface StatusToggleProps {
  active: boolean
  onChange: (value: boolean) => void
  loading?: boolean
}

export function StatusToggle({ active, onChange, loading = false }: StatusToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={loading}
      onClick={() => onChange(!active)}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:ring-offset-2 focus:ring-offset-[var(--bg)]',
        active ? 'bg-[var(--green)]' : 'bg-[var(--border)]',
        loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white transition-transform',
          active ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
