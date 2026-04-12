// Shared skeleton primitives for dashboard loading states

export function SkeletonBox({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-pulse ${className}`}
      style={{ background: 'var(--surface2)' }}
    />
  )
}

export function KpiCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 grid-cols-2 lg:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl p-5 border border-[var(--border)]"
          style={{ background: 'var(--surface)' }}
        >
          <SkeletonBox className="h-3 w-24 mb-3" />
          <SkeletonBox className="h-7 w-32 mb-1" />
          <SkeletonBox className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] overflow-hidden"
      style={{ background: 'var(--surface)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)]"
        style={{ background: 'var(--surface2)' }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBox key={i} className={`h-3 ${i === 0 ? 'w-24' : i === cols - 1 ? 'w-16 ml-auto' : 'w-20'}`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3.5 border-b border-[var(--border)] last:border-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className={`h-3 rounded-lg animate-pulse ${j === 0 ? 'w-32' : j === cols - 1 ? 'w-16 ml-auto' : 'w-24'}`}
              style={{ background: 'var(--surface2)', opacity: 1 - i * 0.08 } as React.CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function PageHeaderSkeleton({ hasButton = true }: { hasButton?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <SkeletonBox className="h-7 w-40 mb-2" />
        <SkeletonBox className="h-4 w-56" />
      </div>
      {hasButton && <SkeletonBox className="h-9 w-32 rounded-lg" />}
    </div>
  )
}
