import { Manrope } from 'next/font/google'

/** The one font of the landing page and the sign-in screen (geometric sans, full Cyrillic). */
export const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})
