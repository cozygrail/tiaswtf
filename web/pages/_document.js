import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head>
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Aggressively hide ALL Next.js development overlays and indicators */
            .nextjs-portal,
            [data-nextjs-toast],
            [data-nextjs-dock],
            [data-nextjs-dialog-overlay],
            [data-nextjs-router-reloader-bar],
            [data-turbo-indicator],
            [data-nextjs-build-indicator],
            .nextjs-build-indicator,
            [data-nextjs-prerender-indicator],
            [data-nextjs-error-overlay],
            [data-nextjs-build-error],
            [data-nextjs-hmr-indicator],
            [data-nextjs-dev-overlay],
            .nextjs-dev-overlay,
            [data-nextjs-compile-indicator],
            [data-overlay],
            [data-error-overlay],
            [id*="nextjs"],
            [class*="nextjs"],
            [data-nextjs-refresh],
            [data-nextjs-fast-refresh],
            .nextjs-container,
            .__next-dev-overlay,
            .__nextjs_original-stack-frame,
            [data-nextjs-terminal],
            [data-nextjs-build-ok],
            [data-nextjs-build-error],
            div[style*="position: fixed"][style*="z-index"],
            div[style*="position: fixed"][style*="bottom: 16px"],
            div[style*="position: fixed"][style*="right: 16px"] {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              pointer-events: none !important;
              position: absolute !important;
              left: -9999px !important;
              top: -9999px !important;
              width: 0 !important;
              height: 0 !important;
            }
            
            /* Hide any fixed positioned elements that might be overlays */
            body > div[style*="position: fixed"]:not(#__next) {
              display: none !important;
            }
          `
        }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

