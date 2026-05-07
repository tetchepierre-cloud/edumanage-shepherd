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
        await get().fetchProfile(session.user.id)
      }
      set({ loading: false })

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    set({ user: { id: userId }, profile })
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