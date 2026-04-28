// src/App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StudentsPage from './pages/StudentsPage'
import FeesPage from './pages/FeesPage'
import FeeManagementPage from './pages/FeeManagementPage'
import ExpensesPage from './pages/ExpensesPage'
import StaffPage from './pages/StaffPage'
import PayrollPage from './pages/PayrollPage'
import StockPage from './pages/StockPage'
import AuditPage from './pages/AuditPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />
  }

  const navItems = [
    { id: 'dashboard',      label: 'Dashboard',       icon: '📊' },
    { id: 'students',       label: 'Students',         icon: '🎓' },
    { id: 'fees',           label: 'Fee Collection',   icon: '💰' },
    { id: 'fee-management', label: 'Fee Structure',    icon: '🗂️' },
    { id: 'expenses',       label: 'Expenses',         icon: '📋' },
    { id: 'staff',          label: 'Staff',            icon: '👥' },
    { id: 'payroll',        label: 'Staff Payroll',    icon: '💼' },
    { id: 'stock',          label: 'Stock',            icon: '📦' },
    { id: 'audit',          label: 'Audit Log',        icon: '🔍' },
    { id: 'settings',       label: 'Settings',         icon: '⚙️' },
  ]

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':      return <DashboardPage />
      case 'students':       return <StudentsPage />
      case 'fees':           return <FeesPage />
      case 'fee-management': return <FeeManagementPage />
      case 'expenses':       return <ExpensesPage />
      case 'staff':          return <StaffPage />
      case 'payroll':        return <PayrollPage />
      case 'stock':          return <StockPage />
      case 'audit':          return <AuditPage />
      case 'settings':       return <SettingsPage />
      default:               return <DashboardPage />
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">

      {/* ── Sidebar ── */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-blue-900 text-white
                    transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-blue-700 flex items-center justify-between">
          {sidebarOpen && (
            <div>
              <h1 className="font-bold text-lg">EduManage</h1>
              <p className="text-blue-300 text-xs">Ghana</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-blue-300 hover:text-white p-1 rounded"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              title={!sidebarOpen ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                ${currentPage === item.id
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`}
            >
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              {sidebarOpen && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User info + Logout */}
        <div className="p-4 border-t border-blue-700">
          {sidebarOpen && (
            <p className="text-blue-300 text-xs mb-2 truncate">
              {session.user.email}
            </p>
          )}
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-full flex items-center gap-2 text-blue-300 hover:text-white
                       text-sm py-2 px-2 rounded hover:bg-blue-800 transition-colors"
          >
            <span>🚪</span>
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        {renderPage()}
      </main>

    </div>
  )
}
