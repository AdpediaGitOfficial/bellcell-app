import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Bell Cell EduSuite',
    template: '%s · Bell Cell EduSuite',
  },
  description:
    'Institute management for Bell Cell Group of Institutions — enquiry, admissions, examinations and accounts.',
  icons: { icon: '/brand/bellcell-logo.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#00A59F',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
