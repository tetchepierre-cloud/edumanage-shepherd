// src/Layout.jsx
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const navigation = [
  { name: 'Dashboard',      href: '/',         icon: '📊' },
  { name: 'Students',       href: '/students', icon: '🎓' },
  { name: 'Fee Management', href: '/fees',     icon: '💰' },  // ✅ mis à jour
  { name: 'Expenses',       href: '/expenses', icon: '📋' },
  { name: 'Staff',          href: '/staff',    icon: '👥' },
  { name: 'Payroll',        href: '/payroll',  icon: '💼' },
  { name: 'Stock',          href: '/stock',    icon: '📦' },
  { name: 'Audit Log',      href: '/audit',    icon: '🔍' },
  { name: 'Settings',       href: '/settings', icon: '⚙️' },
]

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-100">

      {/* ── Sidebar ── */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-blue-900 text-white
                       transition-all duration-300 flex flex-col flex-shrink-0`}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-blue-700">
          {sidebarOpen && (
            <div>
              <h1 className="text-lg font-bold">EduManage</h1>
              <p className="text-xs text-blue-300">Ghana</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:text-blue-300 p-1 rounded"
            title={sidebarOpen ? 'Collapse' : 'Expand'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                title={!sidebarOpen ? item.name : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:bg-blue-700 hover:text-white'
                }`}
              >
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                {sidebarOpen && (
                  <span className="text-sm font-medium">{item.name}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User info + Logout */}
        <div className="p-4 border-t border-blue-700">
          {sidebarOpen && (
            <div className="mb-2">
              <p className="text-sm font-medium truncate">
                {profile?.full_name || user?.email}
              </p>
              <p className="text-xs text-blue-300 capitalize">
                {profile?.role || 'User'}
              </p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="w-full flex items-center gap-2 px-3 py-2 text-blue-200
                       hover:bg-blue-700 hover:text-white rounded-lg transition-colors"
          >
            <span>🚪</span>
            {sidebarOpen && <span className="text-sm">Sign Out</span>}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800">
            {navigation.find(n => n.href === location.pathname)?.name || 'EduManage Ghana'}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {new Date().toLocaleDateString('en-GH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center
                            text-white text-sm font-bold">
              {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>

      </div>
    </div>
  )
}
