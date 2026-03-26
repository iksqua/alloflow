import { render, screen } from '@testing-library/react'
import { TvaBadge } from './tva-badge'

test('affiche 5,5% en amber', () => {
  render(<TvaBadge rate={5.5} />)
  const badge = screen.getByText('TVA 5,5%')
  expect(badge).toHaveClass('text-[var(--amber)]')
})

test('affiche 10% en amber', () => {
  render(<TvaBadge rate={10} />)
  expect(screen.getByText('TVA 10%')).toHaveClass('text-[var(--amber)]')
})

test('affiche 20% en orange', () => {
  render(<TvaBadge rate={20} />)
  expect(screen.getByText('TVA 20%')).toHaveClass('text-[var(--orange)]')
})
