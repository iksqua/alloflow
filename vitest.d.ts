import type { Assertion } from 'vitest'

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveAttribute(attribute: string, value?: string): T
    toBeDisabled(): T
    toHaveClass(className: string): T
  }
}
