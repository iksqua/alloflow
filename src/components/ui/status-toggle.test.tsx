import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StatusToggle } from './status-toggle'

describe('StatusToggle', () => {
  it('affiche ON quand active=true', () => {
    render(<StatusToggle active={true} onChange={() => {}} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('affiche OFF quand active=false', () => {
    render(<StatusToggle active={false} onChange={() => {}} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('appelle onChange au clic', () => {
    const onChange = vi.fn()
    render(<StatusToggle active={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('loading=true désactive le toggle', () => {
    render(<StatusToggle active={true} onChange={() => {}} loading />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })
})
