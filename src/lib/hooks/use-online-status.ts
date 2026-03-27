'use client'
import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  // Always start with true (matches SSR) — useEffect syncs the real value after mount
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Sync with actual browser state after hydration
    setIsOnline(navigator.onLine)

    function handleOnline()  { setIsOnline(true)  }
    function handleOffline() { setIsOnline(false) }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
