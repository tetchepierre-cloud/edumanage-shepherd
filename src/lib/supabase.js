import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let currentAbortController = new AbortController()

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    currentAbortController.abort()
    console.warn('🛑 Requêtes Supabase annulées (onglet masqué)')
    // Sauvegarde de la page en cours pour restaurer après rechargement
    sessionStorage.setItem('edumanage_last_page', window.location.pathname)
  } else {
    currentAbortController = new AbortController()
    window.location.reload()
  }
})

const fetchWithTimeout = (url, options = {}) => {
  const TIMEOUT = 30000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)
  const combinedSignal = anySignal([controller.signal, currentAbortController.signal])

  return fetch(url, { ...options, signal: combinedSignal })
    .then(response => { clearTimeout(timeoutId); return response })
    .catch(error => {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') console.error('⏰ Requête Supabase annulée (timeout)')
      throw error
    })
}

function anySignal(signals) {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(); return controller.signal }
    signal.addEventListener('abort', () => controller.abort())
  }
  return controller.signal
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout }
})

supabase.auth.getSession().then(({ data, error }) => {
  if (error) console.error('Supabase connexion erreur:', error)
  else console.log('✅ Supabase connecté')
})