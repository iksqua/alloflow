'use client'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Product = {
  id: string
  name: string
  price: number
  category: string
  tva_rate: number
  active: boolean
}

type Props = {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export function ProductsTable({ products, onEdit, onDelete }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Prix</TableHead>
          <TableHead>Catégorie</TableHead>
          <TableHead>TVA</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell className="font-medium">{product.name}</TableCell>
            <TableCell>{product.price.toFixed(2)} €</TableCell>
            <TableCell className="capitalize">{product.category}</TableCell>
            <TableCell>{product.tva_rate}%</TableCell>
            <TableCell>
              <Badge variant={product.active ? 'default' : 'secondary'}>
                {product.active ? 'Actif' : 'Inactif'}
              </Badge>
            </TableCell>
            <TableCell className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(product)}>
                Modifier
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(product.id)}
              >
                Désactiver
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {products.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-gray-500 py-8">
              Aucun produit. Créez votre premier produit.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
