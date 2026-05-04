import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ⏱️ Timeout de 30 secondes + annulation si l'onglet est caché
let currentAbortController = new AbortController()
let hidden = false

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hidden = true
    // Annule toutes les requêtes en cours
    currentAbortController.abort()
    console.warn('🛑 Requêtes Supabase annulées (onglet masqué)')
  } else {
    // Nouveau contrôleur pour les prochaines requêtes
    currentAbortController = new AbortController()
    hidden = false
    // Recharge la page pour un état propre
    window.location.reload()
  }
})

const fetchWithTimeout = (url, options = {}) => {
  const TIMEOUT = 30000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

  // Combine le signal du timeout avec le signal global (visibilité)
  const combinedSignal = anySignal([controller.signal, currentAbortController.signal])

  return fetch(url, { ...options, signal: combinedSignal })
    .then(response => {
      clearTimeout(timeoutId)
      return response
    })
    .catch(error => {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        if (hidden) {
          console.warn('⏸️ Requête annulée (page cachée)')
        } else {
          console.error('⏰ Requête Supabase annulée (timeout)')
        }
      }
      throw error
    })
}

// Helper pour combiner plusieurs AbortSignals
function anySignal(signals) {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }
    signal.addEventListener('abort', () => controller.abort())
  }
  return controller.signal
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout }
})

// Test de connexion
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('Supabase connexion erreur:', error)
  } else {
    console.log('✅ Supabase connecté')
  }
})