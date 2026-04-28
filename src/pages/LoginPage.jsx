// src/pages/LoginPage.jsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import toast from 'react-hot-toast'

export default function LoginPage({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // ── 1. Authentification Supabase ──────────────────────────────────────
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // ── Audit log : tentative de connexion échouée ──────────────────────
        await logAction({
          action:      'LOGIN',
          tableName:   'auth',
          recordId:    null,
          oldData:     null,
          newData:     { email, success: false, reason: error.message },
          description: `Failed login attempt — ${email} · Reason: ${error.message}`,
        })

        toast.error('Incorrect email or password')
        return
      }

      // ── 2. Récupérer le profil de l'utilisateur connecté ─────────────────
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', data.user.id)
        .single()

      // ── 3. Audit log : connexion réussie ──────────────────────────────────
      await logAction({
        action:      'LOGIN',
        tableName:   'auth',
        recordId:    data.user.id,
        oldData:     null,
        newData:     {
          email:      data.user.email,
          full_name:  profile?.full_name ?? null,
          role:       profile?.role      ?? null,
          success:    true,
          session_id: data.session?.access_token?.slice(-8) ?? null,
        },
        description: `Successful login — ${profile?.full_name ?? email} `
                   + `(${profile?.role ?? 'unknown role'})`,
      })

      toast.success('Login successful!')
      onLogin(data.session)   // ← App.jsx gère la navigation ✅

    } catch (err) {
      // Erreur réseau ou inattendue
      toast.error('Connection error. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700
                    flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

        {/* ── Logo ── */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center
                          justify-center mx-auto mb-4">
            <span className="text-3xl">🏫</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">EduManage Ghana</h1>
          <p className="text-gray-500 text-sm mt-1">School Management System</p>
        </div>

        {/* ── Formulaire ── */}
        <form onSubmit={handleLogin} className="space-y-4">

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@edumanage.gh"
              required
              autoComplete="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg
                       font-medium hover:bg-blue-700 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>

        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          EduManage Ghana © {new Date().getFullYear()}
        </p>

      </div>
    </div>
  )
}
