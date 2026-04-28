import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Test de connexion
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('Supabase connexion erreur:', error)
  } else {
    console.log('✅ Supabase connecté')
  }
})
