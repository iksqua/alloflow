import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Add custom matchers
expect.extend({
  toHaveAttribute(received: Element, attribute: string, value?: string) {
    const hasAttribute = received.hasAttribute(attribute)
    const attributeValue = received.getAttribute(attribute)

    if (value === undefined) {
      return {
        pass: hasAttribute,
        message: () => `Expected element ${hasAttribute ? 'not ' : ''}to have attribute "${attribute}"`,
      }
    }

    const pass = hasAttribute && attributeValue === value
    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to have attribute "${attribute}" with value "${value}"`
          : `Expected element to have attribute "${attribute}" with value "${value}", but got "${attributeValue}"`,
    }
  },
  toBeDisabled(received: HTMLElement) {
    const isDisabled = received.hasAttribute('disabled') || received.getAttribute('aria-disabled') === 'true'
    return {
      pass: isDisabled,
      message: () => `Expected element ${isDisabled ? 'not ' : ''}to be disabled`,
    }
  },
  toHaveClass(received: Element, className: string) {
    const classList = Array.from(received.classList)
    const hasClass = classList.includes(className)
    return {
      pass: hasClass,
      message: () =>
        hasClass
          ? `Expected element not to have class "${className}"`
          : `Expected element to have class "${className}", but has: ${classList.join(', ')}`,
    }
  },
})
