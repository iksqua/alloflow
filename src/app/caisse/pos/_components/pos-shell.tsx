'use client'
import { useState } from 'react'
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

  const filteredProducts = selectedCategoryId
    ? initialProducts.filter((p) => p.category_id === selectedCategoryId)
    : initialProducts

  return (
    <div className="flex-1 flex overflow-hidden">
      {isOffline && (
        <div
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-xs font-bold"
          style={{ background: '#f59e0b', color: '#0f172a' }}
        >
          <span>⚡</span>
          <span>MODE HORS LIGNE — Seuls les paiements en espèces sont disponibles</span>
        </div>
      )}
      {/* Barre de navigation caisse */}
      <div
        className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-[var(--border)]"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'var(--bg-tabs)', zIndex: 10,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--blue)] flex items-center justify-center text-xs font-bold text-white">A</div>
          <span className="text-sm font-semibold text-[var(--text1)]">Caisse</span>
          {session && (
            <span className="text-xs text-[var(--green)] bg-[var(--green-bg)] px-2 py-0.5 rounded-full">Session ouverte</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFloorPlan(true)}
            className="h-8 px-3 rounded-lg text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
          >
            🗺 Plan de salle
          </button>
          <button
            onClick={() => setShowSops(true)}
            className="h-8 px-3 rounded-lg text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
          >
            📋 SOPs
          </button>
          {userRole !== 'caissier' && (
            <a
              href="/dashboard/products"
              className="h-8 px-3 rounded-lg text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
            >
              ← Dashboard admin
            </a>
          )}
          <button
            onClick={() => setShowSession(true)}
            className="h-8 px-3 rounded-lg text-xs font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
          >
            {cashierName}
          </button>
        </div>
      </div>

      {/* 3 colonnes POS (offset topbar 48px) */}
      <div className="flex flex-1 overflow-hidden" style={{ marginTop: '48px' }}>
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
        <div className={`flex-1 min-w-0 overflow-y-auto flex flex-col ${mobileView === 'ticket' ? 'hidden lg:flex' : 'flex'}`}>
          <ProductsPanel
            products={filteredProducts}
            onAdd={(product) => { addItem(product); setMobileView('ticket') }}
          />
        </div>

        {/* Colonne droite — Ticket — plein écran mobile si vue ticket, sidebar desktop */}
        <div className={`${mobileView === 'menu' ? 'hidden lg:flex' : 'flex'} lg:flex flex-col lg:w-[360px] w-full`}>
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
            onLoyaltySkip={() => setLoyaltyDone(true)}
          />
        </div>
      </div>

      {/* Barre de navigation mobile (masquée sur desktop) */}
      <div className="lg:hidden flex border-t border-[var(--border)]" style={{ background: 'var(--surface)' }}>
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
