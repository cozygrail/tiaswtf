
import '../styles/globals.css'
import { useEffect } from 'react'

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Simple but effective overlay removal
    const hideOverlays = () => {
      // Remove all elements that could be Next.js overlays
      const overlaySelectors = [
        '[data-nextjs-toast]',
        '[data-nextjs-dock]',
        '[data-nextjs-dialog-overlay]',
        '[data-nextjs-router-reloader-bar]',
        '[data-nextjs-build-indicator]',
        '[data-nextjs-error-overlay]',
        '[data-nextjs-dev-overlay]',
        '[data-turbo-indicator]',
        'div[style*="position: fixed"][style*="z-index"]'
      ]

      overlaySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove())
      })
    }

    // Run continuously
    const interval = setInterval(hideOverlays, 50)

    return () => clearInterval(interval)
  }, [])

  return <Component {...pageProps} />
}
