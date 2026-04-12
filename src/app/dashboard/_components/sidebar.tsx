'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: string
  disabled?: boolean
  exact?: boolean
  subItems?: { href: string; label: string; exact?: boolean }[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/dashboard/products', label: 'Produits', icon: '🍽️' },
  { href: '/dashboard/stocks', label: 'Stocks', icon: '📦' },
  { href: '/dashboard/orders', label: 'Historique des ventes', icon: '🧾' },
  {
    href: '/dashboard/analytics',
    label: 'Analytics',
    icon: '📈',
    subItems: [
      { href: '/dashboard/analytics', label: "Vue d'ensemble", exact: true },
      { href: '/dashboard/analytics/report', label: 'Rapport ventes' },
    ],
  },
  {
    href: '/dashboard/crm',
    label: 'CRM',
    icon: '👥',
    subItems: [
      { href: '/dashboard/crm',                       label: 'Clients',     exact: true },
      { href: '/dashboard/crm/campagnes',              label: 'Campagnes' },
      { href: '/dashboard/crm/campagnes/automations',  label: 'Automations' },
      { href: '/dashboard/crm/analytics',              label: 'Persona' },
      { href: '/dashboard/crm/programme',              label: 'Programme' },
    ],
  },
  { href: '/dashboard/recettes', label: 'Recettes', icon: '📖' },
  { href: '/dashboard/sops', label: 'SOPs', icon: '📋' },
  { href: '/dashboard/fiscal', label: 'Journal fiscal', icon: '🗂️' },
]

const SETTINGS_ITEM = { href: '/dashboard/settings', label: 'Paramètres', icon: '⚙️' }

interface SidebarProps {
  userName: string
  userRole: string
  establishmentName?: string
}

export function Sidebar({ userName, userRole, establishmentName }: SidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Hamburger — aligned with topbar height, visible only on mobile */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-0 left-0 z-50 h-12 w-12 flex items-center justify-center text-[var(--text2)] hover:text-[var(--text1)] transition-colors md:hidden"
        aria-label="Ouvrir le menu"
      >
        ☰
      </button>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed left-0 top-0 h-full flex flex-col z-50',
          'transition-transform duration-200 ease-in-out',
          // Mobile: full 220px drawer, off-screen unless open
          'w-[220px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // md+: always visible, icon-only at 60px
          'md:translate-x-0 md:w-[60px]',
          // lg+: full width with labels
          'lg:w-[220px]',
        ].join(' ')}
        style={{
          background: '#111827',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Logo row */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: 'var(--blue)' }}
            >
              A
            </div>
            {/* Text: always on mobile (drawer), hidden at md, back at lg */}
            <div className="min-w-0 md:hidden lg:block">
              <div className="text-sm font-semibold text-[var(--text1)] truncate">
                {establishmentName ?? 'Alloflow'}
              </div>
              <div className="text-xs text-[var(--text3)] capitalize">{userRole}</div>
            </div>
            {/* Close button — mobile only */}
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto text-[var(--text3)] hover:text-[var(--text1)] transition-colors md:hidden"
            >
              ✕
            </button>
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
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="md:hidden lg:block">{item.label}</span>
                  <span className="ml-auto text-[10px] bg-[var(--surface)] px-1.5 py-0.5 rounded text-[var(--text4)] md:hidden lg:block">
                    Bientôt
                  </span>
                </div>
              )
            }

            if (item.subItems) {
              const subItems = item.subItems
              const subTitles = subItems.map((s) => s.label).join(', ')
              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    title={`${item.label}: ${subTitles}`}
                    onClick={() => setMobileOpen(false)}
                    className={[
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'text-white'
                        : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
                    ].join(' ')}
                    style={isActive ? { background: 'var(--blue)' } : undefined}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="md:hidden lg:block">{item.label}</span>
                  </Link>
                  {isActive && (
                    <div className="mt-0.5 ml-3 flex flex-col space-y-0.5 md:hidden lg:flex">
                      {subItems.map((sub) => {
                        const isSubActive = sub.exact
                          ? pathname === sub.href
                          : pathname.startsWith(sub.href)
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => setMobileOpen(false)}
                            className={[
                              'flex items-center gap-2 pl-6 pr-3 py-1.5 rounded-lg text-xs transition-colors',
                              isSubActive
                                ? 'text-white font-medium'
                                : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
                            ].join(' ')}
                            style={isSubActive ? { background: 'var(--blue)' } : undefined}
                          >
                            {sub.label}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={() => setMobileOpen(false)}
                className={[
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'text-white'
                    : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
                ].join(' ')}
                style={isActive ? { background: 'var(--blue)' } : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="md:hidden lg:block">{item.label}</span>
              </Link>
            )
          })}

          <div className="flex-1" />

          {/* Settings */}
          <Link
            href={SETTINGS_ITEM.href}
            title={SETTINGS_ITEM.label}
            onClick={() => setMobileOpen(false)}
            className={[
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(SETTINGS_ITEM.href)
                ? 'text-white'
                : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
            ].join(' ')}
            style={pathname.startsWith(SETTINGS_ITEM.href) ? { background: 'var(--blue)' } : undefined}
          >
            <span className="flex-shrink-0">{SETTINGS_ITEM.icon}</span>
            <span className="md:hidden lg:block">{SETTINGS_ITEM.label}</span>
          </Link>
        </nav>

        {/* Footer — user info */}
        <div className="p-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 px-3 py-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--surface2)' }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 md:hidden lg:block">
              <div className="text-xs font-medium text-[var(--text1)] truncate">{userName}</div>
              <div className="text-[10px] text-[var(--text3)] capitalize">{userRole}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
