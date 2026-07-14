import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        set({ user: session.user }) // ← CORRECTION : sauvegarde du user
        await get().fetchProfile(session.user.id)
      }
      set({ loading: false })

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          set({ user: session.user }) // ← CORRECTION : sauvegarde au changement
          await get().fetchProfile(session.user.id)
        } else {
          set({ user: null, profile: null })
        }
      })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  fetchProfile: async (userId) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (!error && profile) {
        set(state => ({ ...state, profile }))
      }
    } catch (err) {
      console.error("Erreur de chargement du profil:", err)
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
    set({ loading: false })
    return { success: true }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },
}))