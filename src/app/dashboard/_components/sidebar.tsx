'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/dashboard/products', label: 'Produits', icon: '🍽️' },
  { href: '/dashboard/orders', label: 'Commandes', icon: '📋', disabled: true },
  { href: '/dashboard/analytics', label: 'Analytique', icon: '📈', disabled: true },
  { href: '/dashboard/stocks', label: 'Stocks', icon: '📦' },
  { href: '/dashboard/recettes', label: 'Recettes', icon: '📖' },
  { href: '/dashboard/sops', label: 'SOPs', icon: '📋' },
  { href: '/dashboard/fiscal', label: 'Journal fiscal', icon: '📋' },
  { href: '/dashboard/crm', label: 'CRM', icon: '👥', disabled: true },
]

const SETTINGS_ITEM = { href: '/dashboard/settings', label: 'Paramètres', icon: '⚙️', disabled: true }

interface SidebarProps {
  userName: string
  userRole: string
  establishmentName?: string
}

export function Sidebar({ userName, userRole, establishmentName }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col"
      style={{
        width: '220px',
        background: '#111827',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: 'var(--blue)' }}
          >
            A
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text1)] truncate">
              {establishmentName ?? 'Alloflow'}
            </div>
            <div className="text-xs text-[var(--text3)] capitalize">{userRole}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--text4)] cursor-not-allowed"
                title={item.label}
              >
                <span>{item.icon}</span>
                <span className="hidden xl:block">{item.label}</span>
                <span className="ml-auto text-[10px] bg-[var(--surface)] px-1.5 py-0.5 rounded text-[var(--text4)] hidden xl:block">
                  Bientôt
                </span>
              </div>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
              ].join(' ')}
              style={isActive ? { background: 'var(--blue)' } : undefined}
            >
              <span>{item.icon}</span>
              <span className="hidden xl:block">{item.label}</span>
            </Link>
          )
        })}

        {/* Spacer pour pousser Paramètres en bas */}
        <div className="flex-1" />
        {/* Paramètres */}
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--text4)] cursor-not-allowed"
          title={SETTINGS_ITEM.label}
        >
          <span>{SETTINGS_ITEM.icon}</span>
          <span className="hidden xl:block">{SETTINGS_ITEM.label}</span>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'var(--surface2)' }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 hidden xl:block">
            <div className="text-xs font-medium text-[var(--text1)] truncate">{userName}</div>
            <div className="text-[10px] text-[var(--text3)] capitalize">{userRole}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
