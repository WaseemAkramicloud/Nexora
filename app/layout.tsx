import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/lib/i18n/context'

export const metadata: Metadata = {
  title: 'NEXORA — Next-Gen Enterprise Outbound & Operational SaaS',
  description: 'Enterprise B2B lead discovery, outbound campaign automation, multi-channel sales pipeline, and organizational operational platform.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
