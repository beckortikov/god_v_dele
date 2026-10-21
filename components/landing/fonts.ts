import { Montserrat } from 'next/font/google'

/** The display font of the landing, the sign-in screen and the participant app (geometric sans, full Cyrillic, one variable file per script). */
export const display = Montserrat({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display',
  display: 'swap',
})
