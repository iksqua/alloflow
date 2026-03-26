'use client'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatusToggle } from '@/components/ui/status-toggle'
import { EmptyState } from '@/components/ui/empty-state'
import type { Product } from './types'

type Props = {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string, active: boolean) => void
}

export function ProductsTable({ products, onEdit, onDelete, onToggleStatus }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-3 py-2 text-xs font-medium text-[var(--text3)] uppercase tracking-wide">Nom</TableHead>
          <TableHead className="px-3 py-2 text-xs font-medium text-[var(--text3)] uppercase tracking-wide">Catégorie</TableHead>
          <TableHead className="px-3 py-2 text-xs font-medium text-[var(--text3)] uppercase tracking-wide">Prix TTC</TableHead>
          <TableHead className="px-3 py-2 text-xs font-medium text-[var(--text3)] uppercase tracking-wide">TVA</TableHead>
          <TableHead className="px-3 py-2 text-xs font-medium text-[var(--text3)] uppercase tracking-wide">Statut</TableHead>
          <TableHead className="px-3 py-2 text-xs font-medium text-[var(--text3)] uppercase tracking-wide">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id} className="hover:bg-[var(--surface2)] transition-colors">
            <TableCell className="px-3 py-2.5 text-sm text-[var(--text2)] font-medium">{product.name}</TableCell>
            <TableCell className="px-3 py-2.5 text-sm text-[var(--text2)] capitalize">{product.category}</TableCell>
            <TableCell className="px-3 py-2.5 text-sm text-[var(--text2)]">{product.price.toFixed(2)} €</TableCell>
            <TableCell className="px-3 py-2.5 text-sm text-[var(--text2)]">{product.tva_rate}%</TableCell>
            <TableCell className="px-3 py-2.5 text-sm text-center">
              <StatusToggle
                active={product.active}
                onChange={(value) => onToggleStatus(product.id, value)}
              />
            </TableCell>
            <TableCell className="px-3 py-2.5 text-sm">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEdit(product)}
                  className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--text1)] hover:bg-[var(--surface2)] transition-colors"
                  title="Modifier"
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(product.id)}
                  className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
                  title="Désactiver"
                >
                  🗑️
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {products.length === 0 && (
          <TableRow>
            <TableCell colSpan={6}>
              <EmptyState
                icon="🍽️"
                title="Aucun produit"
                description="Créez votre premier produit pour commencer."
              />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
