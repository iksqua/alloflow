import type { OrderRow } from './types'

export function ordersToCSV(rows: OrderRow[]): string {
  const headers = ['Date/Heure', 'Ticket#', 'Produits', 'Paiement', 'Montant HT', 'TVA', 'Montant TTC']
  const lines = [
    headers.join(';'),
    ...rows.map(r => [
      new Date(r.createdAt).toLocaleString('fr-FR'),
      r.ticketNumber,
      `"${r.products}"`,
      r.paymentMethod === 'cash' ? 'Espèces' : 'Carte',
      r.amountHt.toFixed(2).replace('.', ','),
      r.tvaAmount.toFixed(2).replace('.', ','),
      r.amountTtc.toFixed(2).replace('.', ','),
    ].join(';'))
  ]
  return lines.join('\n')
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
