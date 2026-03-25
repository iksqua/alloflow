'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Product } from './types'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (data: Omit<Product, 'id' | 'active'>) => Promise<void>
  product?: Product | null
}

const CATEGORIES = ['entree', 'plat', 'dessert', 'boisson', 'autre']
const TVA_RATES = [5.5, 10, 20]

export function ProductForm({ open, onClose, onSave, product }: Props) {
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(String(product?.price ?? ''))
  const [category, setCategory] = useState(product?.category ?? 'plat')
  const [tvaRate, setTvaRate] = useState(String(product?.tva_rate ?? '10'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(product?.name ?? '')
      setPrice(String(product?.price ?? ''))
      setCategory(product?.category ?? 'plat')
      setTvaRate(String(product?.tva_rate ?? '10'))
      setError(null)
    }
  }, [open, product])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSave({
        name,
        price: parseFloat(price),
        category,
        tva_rate: parseFloat(tvaRate),
      })
      onClose()
    } catch (err) {
      setError('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="price">Prix (€)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>TVA</Label>
            <Select value={tvaRate} onValueChange={setTvaRate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TVA_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
