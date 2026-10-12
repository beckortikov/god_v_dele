import { Unbounded } from 'next/font/google'

/** Display font shared by the landing page and the sign-in screen. */
export const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600'],
  variable: '--font-unbounded',
  display: 'swap',
})
