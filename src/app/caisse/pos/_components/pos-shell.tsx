'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useOnlineStatus } from '@/lib/hooks/use-online-status'
import { CategoriesPanel } from './categories-panel'
import { ProductsPanel } from './products-panel'
import { TicketPanel } from './ticket-panel'
import { PaymentModal } from './payment-modal'
import { ReceiptModal } from './receipt-modal'
import { DiscountModal } from './discount-modal'
import { FloorPlanModal } from './floor-plan-modal'
import { SessionModal } from './session-modal'
import { LoyaltyModal } from './loyalty-modal'
import { SopModal } from './sop-modal'
import type { LocalTicket, LocalItem, CashSession, Order, LoyaltyCustomer, LoyaltyReward } from '../types'

interface EstablishmentInfo {
  name: string
  siret: string | null
  address: string | null
  receiptFooter: string | null
}

interface PosShellProps {
  initialProducts: Array<{
    id: string; name: string; emoji: string | null
    price: number; tva_rate: number; category_id: string | null; is_active: boolean
  }>
  initialCategories: Array<{ id: string; name: string; icon: string | null; color_hex: string }>
  initialSession: CashSession | null
  initialTables: Array<{ id: string; name: string; status: string; current_order_id: string | null }>
  cashierId: string
  cashierName: string
  userRole: string
  establishmentId: string
  establishmentInfo: EstablishmentInfo
}

function SessionDuration({ openedAt }: { openedAt: string }) {
  const [label, setLabel] = useState(() => formatDur(openedAt))
  useEffect(() => {
    const id = setInterval(() => setLabel(formatDur(openedAt)), 30000)
    return () => clearInterval(id)
  }, [openedAt])
  return <>{label}</>
}

function formatDur(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`
  return `${m} min`
}

const EMPTY_TICKET: LocalTicket = { items: [], discount: null, tableId: null, note: '' }

export function PosShell({
  initialProducts,
  initialCategories,
  initialSession,
  initialTables,
  cashierId,
  cashierName,
  userRole,
  establishmentId,
  establishmentInfo,
}: PosShellProps) {
  const [session, setSession] = useState<CashSession | null>(initialSession)
  const [ticket, setTicket] = useState<LocalTicket>(EMPTY_TICKET)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)
  const [mobileView, setMobileView] = useState<'menu' | 'ticket'>('menu')

  const isOnline = useOnlineStatus()
  const isOffline = !isOnline

  // Modals
  const [showPayment, setShowPayment] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [showFloorPlan, setShowFloorPlan] = useState(false)
  const [showSession, setShowSession] = useState(!session)
  const [linkedCustomer, setLinkedCustomer] = useState<LoyaltyCustomer | null>(null)
  const [linkedReward,   setLinkedReward]   = useState<LoyaltyReward | null>(null)
  const [loyaltyDone,    setLoyaltyDone]    = useState(false)
  const [showLoyalty,    setShowLoyalty]    = useState(false)
  const [showSops,       setShowSops]       = useState(false)

  const addItem = (product: typeof initialProducts[0]) => {
    setTicket((prev) => {
      const existing = prev.items.find((i) => i.productId === product.id)
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      const newItem: LocalItem = {
        productId: product.id,
        productName: product.name,
        emoji: product.emoji,
        unitPriceHt: product.price,
        tvaRate: product.tva_rate,
        quantity: 1,
      }
      return { ...prev, items: [...prev.items, newItem] }
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setTicket((prev) => {
      const items = prev.items
        .map((i) => i.productId === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
      return { ...prev, items }
    })
  }

  const removeItem = (productId: string) => {
    setTicket((prev) => ({ ...prev, items: prev.items.filter((i) => i.productId !== productId) }))
  }

  const clearTicket = () => {
    setTicket(EMPTY_TICKET)
    setLinkedCustomer(null)
    setLinkedReward(null)
    setLoyaltyDone(false)
  }

  const filteredProducts = (() => {
    let base = selectedCategoryId
      ? initialProducts.filter((p) => p.category_id === selectedCategoryId)
      : initialProducts
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      base = base.filter((p) => p.name.toLowerCase().includes(q))
    }
    return base
  })()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {isOffline && (
        <div
          className="flex-shrink-0 flex items-center justify-center gap-2 py-1.5 text-xs font-bold z-[100]"
          style={{ background: '#f59e0b', color: '#0f172a' }}
        >
          <span>⚡</span>
          <span>MODE HORS LIGNE — Seuls les paiements en espèces sont disponibles</span>
        </div>
      )}
      {/* Barre de navigation caisse */}
      <div
        className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-[var(--border)]"
        style={{ background: 'var(--bg-tabs)', zIndex: 10 }}
      >
        {/* Gauche : logo + caissier */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--blue)] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">A</div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-xs font-semibold text-[var(--text1)]">Caisse</span>
            <span className="text-[10px] text-[var(--text3)]">{cashierName}</span>
          </div>
        </div>

        {/* Centre : statut session */}
        <button
          onClick={() => setShowSession(true)}
          className={[
            'flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all border',
            session
              ? 'text-[var(--green)] hover:bg-[rgba(16,185,129,0.08)]'
              : 'text-white hover:opacity-90',
          ].join(' ')}
          style={session
            ? { borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)' }
            : { background: '#d97706', border: '1px solid #b45309' }
          }
        >
          <span
            className={session ? 'w-1.5 h-1.5 rounded-full bg-[var(--green)]' : ''}
            style={session ? { animation: 'none' } : undefined}
          />
          {session ? (
            <span>Session ouverte · <SessionDuration openedAt={session.opened_at} /></span>
          ) : (
            <span>🔓 Ouvrir la caisse</span>
          )}
        </button>

        {/* Droite : actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFloorPlan(true)}
            title="Plan de salle"
            className="h-8 w-8 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex items-center justify-center"
          >
            🗺
          </button>
          <button
            onClick={() => setShowSops(true)}
            title="Guides"
            className="h-8 w-8 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex items-center justify-center"
          >
            📋
          </button>
          {userRole !== 'caissier' && (
            <a
              href="/dashboard"
              title="Dashboard"
              className="h-8 px-2.5 rounded-lg text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex items-center"
            >
              ← Dashboard
            </a>
          )}
        </div>
      </div>

      {/* 3 colonnes POS */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Colonne gauche — Catégories 200px — desktop uniquement */}
        <div className="hidden lg:flex flex-col flex-shrink-0 overflow-y-auto">
          <CategoriesPanel
            categories={initialCategories}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            allCount={initialProducts.length}
          />
        </div>

        {/* Colonne centre — Produits flex — masquée sur mobile si vue ticket */}
        <div className={`flex-1 min-w-0 flex flex-col ${mobileView === 'ticket' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Barre de recherche */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border)]" style={{ background: 'var(--bg-caisse)' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Rechercher un produit…"
              className="w-full h-8 px-3 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text1)',
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <ProductsPanel
              products={filteredProducts}
              onAdd={(product) => { addItem(product); setMobileView('ticket'); setSearchQuery('') }}
            />
          </div>
        </div>

        {/* Colonne droite — Ticket — plein écran mobile si vue ticket, sidebar desktop */}
        <div className={`${mobileView === 'menu' ? 'hidden lg:flex' : 'flex'} lg:flex flex-col lg:w-[360px] w-full overflow-hidden`}>
          <TicketPanel
            ticket={ticket}
            onUpdateQuantity={updateQuantity}
            onRemove={removeItem}
            onClear={clearTicket}
            onDiscount={() => setShowDiscount(true)}
            onPay={() => {
              if (!session) {
                if (userRole === 'caissier') {
                  toast.info('Session non ouverte — contactez un responsable pour démarrer la caisse')
                  return
                }
                setShowSession(true)
                return
              }
              setShowPayment(true)
            }}
            sessionOpen={!!session}
            linkedCustomer={linkedCustomer}
            linkedReward={linkedReward}
            loyaltyDone={loyaltyDone}
            onLoyaltyTrigger={() => setShowLoyalty(true)}
          />
        </div>
      </div>

      {/* Barre de navigation mobile (masquée sur desktop) */}
      <div className="lg:hidden flex flex-shrink-0 border-t border-[var(--border)]" style={{ background: 'var(--surface)' }}>
        <button
          onClick={() => setMobileView('menu')}
          className={`flex-1 py-3 text-sm font-medium ${mobileView === 'menu' ? 'text-[var(--blue)]' : 'text-[var(--text3)]'}`}
        >
          Menu
        </button>
        <button
          onClick={() => setMobileView('ticket')}
          className={`flex-1 py-3 text-sm font-medium relative ${mobileView === 'ticket' ? 'text-[var(--blue)]' : 'text-[var(--text3)]'}`}
        >
          Ticket {ticket.items.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[var(--blue)] text-white">
              {ticket.items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Modales */}
      {showPayment && (
        <PaymentModal
          ticket={ticket}
          session={session}
          cashierId={cashierId}
          isOffline={isOffline}
          linkedCustomer={linkedCustomer}
          linkedReward={linkedReward}
          onClose={() => setShowPayment(false)}
          onSuccess={(order) => {
            setCompletedOrder(order)
            setShowPayment(false)
            setShowReceipt(true)
            clearTicket()
          }}
        />
      )}

      {showReceipt && completedOrder && (
        <ReceiptModal
          order={completedOrder}
          linkedCustomer={linkedCustomer}
          establishmentInfo={establishmentInfo}
          onClose={() => { setShowReceipt(false); setCompletedOrder(null) }}
          onNewOrder={() => { setShowReceipt(false); setCompletedOrder(null) }}
        />
      )}

      {showDiscount && (
        <DiscountModal
          ticket={ticket}
          onApply={(discount) => {
            setTicket((prev) => ({ ...prev, discount }))
            setShowDiscount(false)
          }}
          onClose={() => setShowDiscount(false)}
        />
      )}

      {showFloorPlan && (
        <FloorPlanModal
          tables={initialTables}
          onSelectTable={(tableId) => {
            setTicket((prev) => ({ ...prev, tableId }))
            setShowFloorPlan(false)
          }}
          onClose={() => setShowFloorPlan(false)}
        />
      )}

      {showSession && (
        <SessionModal
          session={session}
          onOpen={(newSession) => { setSession(newSession); setShowSession(false) }}
          onClose={(closedSession) => { setSession(closedSession); setShowSession(false) }}
          onDismiss={() => setShowSession(false)}
          userRole={userRole}
        />
      )}

      {showLoyalty && (
        <LoyaltyModal
          open={showLoyalty}
          orderTotal={(() => {
            // Compute total after any commercial discount (before loyalty)
            let subtotalHt = 0
            let totalTax = 0
            for (const item of ticket.items) {
              const lineHt = item.unitPriceHt * item.quantity
              subtotalHt += lineHt
              totalTax += lineHt * (item.tvaRate / 100)
            }
            let discount = 0
            if (ticket.discount) {
              discount = ticket.discount.type === 'percent'
                ? subtotalHt * (ticket.discount.value / 100)
                : ticket.discount.value
            }
            const discountedHt = subtotalHt - discount
            const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1
            return discountedHt + totalTax * ratio
          })()}
          onClose={() => setShowLoyalty(false)}
          onConfirm={(customer, reward) => {
            setLinkedCustomer(customer)
            setLinkedReward(reward)
            setLoyaltyDone(true)
            setShowLoyalty(false)
          }}
          onSkip={() => {
            setLoyaltyDone(true)
            setShowLoyalty(false)
          }}
        />
      )}

      {showSops && (
        <SopModal
          establishmentId={establishmentId}
          onClose={() => setShowSops(false)}
        />
      )}
    </div>
  )
}
