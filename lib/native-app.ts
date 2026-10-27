// The iOS App Store build (god_v_dele/ios, Capacitor) appends this marker to the WebView user agent.
// Inside it the site skips the public landing and offers only login + password: App Store rule 4.8
// would require «Sign in with Apple» next to «Войти через Telegram».
export const IOS_APP_UA = 'GodVDeleApp-iOS'

/** Client-only: call after mount, never during server render. */
export function isIosApp(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes(IOS_APP_UA)
}

type CapacitorWindow = Window & {
  Capacitor?: { Plugins?: { SplashScreen?: { hide: (options?: { fadeOutDuration?: number }) => Promise<void> } } }
}

/** The iOS shell keeps its branded splash up until the page is ready to draw (ios/capacitor.config.ts). */
export function hideNativeSplash() {
  ;(window as CapacitorWindow).Capacitor?.Plugins?.SplashScreen?.hide({ fadeOutDuration: 250 })?.catch(() => {})
}
