// Kept out of the 'use client' theme provider: the server layout inlines this script, and a constant
// exported from a client module reaches the server as a client reference, not as the string.
export const ACCENT_KEY = 'ui-accent'

/** Runs before paint so the saved accent never flashes. */
export const ACCENT_INIT_SCRIPT = `try{var a=localStorage.getItem('${ACCENT_KEY}');if(a&&a!=='indigo')document.documentElement.dataset.accent=a}catch(e){}`
