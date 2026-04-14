// src/app/dashboard/marchandise/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg" style={{ background: 'var(--surface2)' }} />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
      <div className="h-10 rounded-xl" style={{ background: 'var(--surface)' }} />
      <div className="h-64 rounded-xl" style={{ background: 'var(--surface)' }} />
    </div>
  )
}
