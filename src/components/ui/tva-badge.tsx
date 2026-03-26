type TvaRate = 5.5 | 10 | 20

interface TvaBadgeProps {
  rate: TvaRate
}

export function TvaBadge({ rate }: TvaBadgeProps) {
  const isOrange = rate === 20
  return (
    <span
      className={[
        'text-xs font-semibold px-1.5 py-0.5 rounded',
        isOrange
          ? 'text-[var(--orange)] bg-[var(--orange-bg)]'
          : 'text-[var(--amber)] bg-[var(--amber-bg)]',
      ].join(' ')}
    >
      TVA {rate === 5.5 ? '5,5' : rate}%
    </span>
  )
}
