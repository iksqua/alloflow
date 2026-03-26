interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {icon && (
        <span className="text-5xl mb-4 opacity-40">{icon}</span>
      )}
      <h3 className="text-base font-semibold text-[var(--text1)] mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text3)] max-w-xs mb-6">{description}</p>
      )}
      {action}
    </div>
  )
}
