import { Montserrat } from 'next/font/google'

/** The one font of the landing page and the sign-in screen (geometric sans, full Cyrillic). */
export const display = Montserrat({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})
