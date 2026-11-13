// The iOS App Store build (god_v_dele/ios, Capacitor) appends this marker to the WebView user agent.
// Inside it the site skips the public landing and offers only login + password: App Store rule 4.8
// would require «Sign in with Apple» next to «Войти через Telegram».
export const IOS_APP_UA = 'GodVDeleApp-iOS'

/** Client-only: call after mount, never during server render. */
export function isIosApp(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes(IOS_APP_UA)
}

type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

/** The slice of @capacitor/local-notifications the site uses; the plugin itself lives in the iOS shell. */
export interface LocalNotificationsPlugin {
  checkPermissions(): Promise<{ display: PermissionState }>
  requestPermissions(): Promise<{ display: PermissionState }>
  getPending(): Promise<{ notifications: { id: number }[] }>
  cancel(options: { notifications: { id: number }[] }): Promise<void>
  schedule(options: {
    notifications: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle?: boolean }; extra?: Record<string, unknown> }[]
  }): Promise<unknown>
  addListener(
    event: 'localNotificationActionPerformed',
    handler: (e: { notification: { extra?: Record<string, unknown> } }) => void
    // a promise through @capacitor/core, the handle itself through the bare bridge the site talks to
  ): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> }
}

type CapacitorWindow = Window & {
  Capacitor?: {
    Plugins?: {
      SplashScreen?: { hide: (options?: { fadeOutDuration?: number }) => Promise<void> }
      LocalNotifications?: LocalNotificationsPlugin
    }
  }
}

/** The phone's own notifications, only inside the iOS app (null in a browser or an older app build). */
export function localNotifications(): LocalNotificationsPlugin | null {
  if (typeof window === 'undefined' || !isIosApp()) return null
  return (window as CapacitorWindow).Capacitor?.Plugins?.LocalNotifications ?? null
}

/** The iOS shell keeps its branded splash up until the page is ready to draw (ios/capacitor.config.ts). */
export function hideNativeSplash() {
  ;(window as CapacitorWindow).Capacitor?.Plugins?.SplashScreen?.hide({ fadeOutDuration: 250 })?.catch(() => {})
}
