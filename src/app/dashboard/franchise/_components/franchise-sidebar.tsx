'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/dashboard/franchise/command-center', label: '📊 Command Center' },
  { href: '/dashboard/franchise/franchises',     label: '🏪 Franchisés' },
  { href: '/dashboard/franchise/pilotage',       label: '🎛 Pilotage' },
  { href: '/dashboard/franchise/catalogue',      label: '📦 Catalogue réseau' },
  { href: '/dashboard/franchise/loyalty',        label: '🎁 Fidélité' },
  { href: '/dashboard/franchise/analytics',      label: '📈 Analytiques' },
  { href: '/dashboard/settings/compte',          label: '👤 Mon compte' },
]

export function FranchiseSidebar() {
  const pathname = usePathname()

  return (
    <nav
      className="w-48 flex-shrink-0 flex flex-col gap-1 py-6 px-3 border-r"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wider px-2 mb-2">
        🍪 Allocookie Siège
      </p>
      {links.map(link => {
        const active = pathname === link.href || pathname.startsWith(link.href + '/')
        return (
          <Link
            key={link.href}
            href={link.href}
            className="px-3 py-2 rounded-lg text-sm transition-colors"
            style={
              active
                ? { background: 'var(--selection-bg)', color: 'var(--text1)', fontWeight: 500 }
                : { color: 'var(--text3)' }
            }
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
