'use client'
import { useState } from 'react'
import { CategoriesPanel } from './categories-panel'
import { ProductsPanel } from './products-panel'
import { TicketPanel } from './ticket-panel'
import { PaymentModal } from './payment-modal'
import { ReceiptModal } from './receipt-modal'
import { DiscountModal } from './discount-modal'
import { FloorPlanModal } from './floor-plan-modal'
import { SessionModal } from './session-modal'
import type { LocalTicket, LocalItem, CashSession, Order } from '../types'

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
}: PosShellProps) {
  const [session, setSession] = useState<CashSession | null>(initialSession)
  const [ticket, setTicket] = useState<LocalTicket>(EMPTY_TICKET)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)

  // Modals
  const [showPayment, setShowPayment] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [showFloorPlan, setShowFloorPlan] = useState(false)
  const [showSession, setShowSession] = useState(!session)

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

  const clearTicket = () => setTicket(EMPTY_TICKET)

  const filteredProducts = selectedCategoryId
    ? initialProducts.filter((p) => p.category_id === selectedCategoryId)
    : initialProducts

  return (
    <div className="flex-1 flex overflow-hidden">
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
        {/* Colonne gauche — Catégories 200px */}
        <CategoriesPanel
          categories={initialCategories}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          allCount={initialProducts.length}
        />

        {/* Colonne centre — Produits flex */}
        <ProductsPanel
          products={filteredProducts}
          onAdd={addItem}
        />

        {/* Colonne droite — Ticket 360px */}
        <TicketPanel
          ticket={ticket}
          onUpdateQuantity={updateQuantity}
          onRemove={removeItem}
          onClear={clearTicket}
          onDiscount={() => setShowDiscount(true)}
          onPay={() => session ? setShowPayment(true) : setShowSession(true)}
          sessionOpen={!!session}
        />
      </div>

      {/* Modales */}
      {showPayment && (
        <PaymentModal
          ticket={ticket}
          session={session}
          cashierId={cashierId}
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
    </div>
  )
}
