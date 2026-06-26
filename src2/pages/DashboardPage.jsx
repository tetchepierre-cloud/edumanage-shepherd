// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { CanSee } from '../components/PermissionGate'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalFees: 0,
    totalExpenses: 0,
    totalPayroll: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentPayments, setRecentPayments] = useState([])
  const [recentExpenses, setRecentExpenses] = useState([])

  const formatGHS = (amount) =>
    new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS'
    }).format(amount || 0)

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      const currentMonth = now.getMonth() + 1
      const currentYear  = now.getFullYear()

      const { count: studentsCount, error: sError } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
      if (sError) console.error('students error:', sError)

      const { data: feesData, error: feesError } = await supabase
        .from('fee_payments')
        .select('amount, payment_date, created_at')
        .in('status', ['paid', 'partial'])

      if (feesError) console.error('fees error:', feesError)
      const totalFees = (feesData || []).filter(p => {
        const effectiveDate = p.payment_date ? p.payment_date : p.created_at
        return effectiveDate >= firstDay && effectiveDate <= lastDay
      }).reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0)

      const { data: expensesData, error: expError } = await supabase
        .from('expenses')
        .select('amount, created_at')
        .gte('created_at', firstDay)
        .lte('created_at', lastDay)

      if (expError) console.error('expenses error:', expError)
      const totalExpenses = (expensesData || []).reduce(
        (sum, e) => sum + (parseFloat(e.amount) || 0), 0
      )

      const { data: payrollData, error: payError } = await supabase
        .from('payroll')
        .select('net_salary')
        .eq('month', currentMonth)
        .eq('year', currentYear)

      if (payError) console.error('payroll error:', payError)
      const totalPayroll = (payrollData || []).reduce(
        (sum, p) => sum + (parseFloat(p.net_salary) || 0), 0
      )

      const { data: stockData, error: stockError } = await supabase
        .from('stock_items')
        .select('quantity, minimum_stock')
        .eq('is_active', true)

      if (stockError) console.error('stock error:', stockError)
      const lowStockCount = (stockData || []).filter(i => i.quantity > 0 && i.quantity <= i.minimum_stock).length
      const outOfStockCount = (stockData || []).filter(i => i.quantity <= 0).length

      const { data: recentFeesRaw, error: rfError } = await supabase
        .from('fee_payments')
        .select(`id, amount, payment_type, payment_method, status, term, academic_year, payment_date, created_at, student_id, students (first_name, last_name)`)
        .order('payment_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(5)

      if (rfError) console.error('recent payments error:', rfError)
      const enrichedPayments = (recentFeesRaw || []).map((payment) => ({
        ...payment,
        studentName: payment.students
          ? `${payment.students.first_name} ${payment.students.last_name}`
          : 'Unknown Student',
      }))
      setRecentPayments(enrichedPayments)

      const { data: recentExpensesData, error: reError } = await supabase
        .from('expenses')
        .select('id, description, amount, category, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
      if (reError) console.error('recent expenses error:', reError)
      setRecentExpenses(recentExpensesData || [])

      setStats({
        totalStudents: studentsCount || 0,
        totalFees,
        totalExpenses,
        totalPayroll,
        lowStockItems: lowStockCount,
        outOfStockItems: outOfStockCount,
      })

    } catch (error) {
      console.error('Dashboard fatal error:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title:  'Active Students',
      value:  stats.totalStudents,
      icon:   '🎓',
      bg:     'bg-blue-50',
      border: 'border-blue-200',
      text:   'text-blue-700',
      sub:    'currently enrolled',
    },
    {
      title:  'Fees Collected',
      value:  formatGHS(stats.totalFees),
      icon:   '💰',
      bg:     'bg-green-50',
      border: 'border-green-200',
      text:   'text-green-700',
      sub:    'this month',
    },
    {
      title:  'Expenses',
      value:  formatGHS(stats.totalExpenses),
      icon:   '📋',
      bg:     'bg-red-50',
      border: 'border-red-200',
      text:   'text-red-700',
      sub:    'this month',
    },
    {
      title:  'Staff Payroll',
      value:  formatGHS(stats.totalPayroll),
      icon:   '👥',
      bg:     'bg-purple-50',
      border: 'border-purple-200',
      text:   'text-purple-700',
      sub:    'this month',
    },
    {
      title:  'Low Stock Items',
      value:  stats.lowStockItems,
      icon:   '📦',
      bg:     stats.lowStockItems > 0 ? 'bg-orange-50' : 'bg-gray-50',
      border: stats.lowStockItems > 0 ? 'border-orange-200' : 'border-gray-200',
      text:   stats.lowStockItems > 0 ? 'text-orange-700' : 'text-gray-700',
      sub:    stats.outOfStockItems > 0
                ? `${stats.outOfStockItems} out of stock`
                : 'below minimum stock',
    },
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2
                          border-blue-600 mx-auto mb-3" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const netBalance = stats.totalFees - stats.totalExpenses - stats.totalPayroll

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GH', {
            weekday: 'long', year: 'numeric',
            month: 'long', day: 'numeric'
          })}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Showing data for{' '}
          {new Date().toLocaleDateString('en-GH', {
            month: 'long', year: 'numeric'
          })}
        </p>
      </div>

      {/* ── Stat Cards ── */}
      <CanSee module="dashboard" section="cards" element="Stats cards">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {statCards.map((card) => (
            <div
              key={card.title}
              className={`${card.bg} ${card.border} border rounded-xl p-4`}
            >
              <span className="text-2xl">{card.icon}</span>
              <p className="text-gray-500 text-xs font-medium mt-2">{card.title}</p>
              <p className={`${card.text} text-xl font-bold mt-1`}>{card.value}</p>
              <p className="text-gray-400 text-xs mt-1">{card.sub}</p>
            </div>
          ))}
        </div>
      </CanSee>

      {/* ── Recent Tables ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Payments */}
        <CanSee module="dashboard" section="table" element="Recent Payments">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">💰 Recent Payments</h2>
              <span className="text-xs text-gray-400">
                {recentPayments.length} record{recentPayments.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="p-4">
              {recentPayments.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">
                  No payments recorded yet
                </p>
              ) : (
                <div className="space-y-1">
                  {recentPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between
                                 py-2.5 border-b border-gray-50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {payment.studentName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {payment.payment_type || 'Payment'}
                          {payment.term && ` • ${payment.term}`}
                          {' • '}
                          {new Date(payment.payment_date || payment.created_at)
                            .toLocaleDateString('en-GH')}
                        </p>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        <p className="text-green-600 font-semibold text-sm">
                          {formatGHS(payment.amount)}
                        </p>
                        <p className="text-xs text-gray-400 capitalize">
                          {payment.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CanSee>

        {/* Recent Expenses */}
        <CanSee module="dashboard" section="table" element="Recent Expenses">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">📋 Recent Expenses</h2>
              <span className="text-xs text-gray-400">
                {recentExpenses.length} record{recentExpenses.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="p-4">
              {recentExpenses.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">
                  No expenses recorded yet
                </p>
              ) : (
                <div className="space-y-1">
                  {recentExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between
                                 py-2.5 border-b border-gray-50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {expense.description}
                        </p>
                        <p className="text-xs text-gray-400 capitalize">
                          {expense.category} •{' '}
                          {new Date(expense.created_at)
                            .toLocaleDateString('en-GH')}
                        </p>
                      </div>
                      <span className="text-red-500 font-semibold text-sm ml-3 shrink-0">
                        {formatGHS(expense.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CanSee>

      </div>

      {/* ── Net Balance ── */}
      <CanSee module="dashboard" section="banner" element="Net Balance">
        <div className={`rounded-xl p-5 border ${
          netBalance >= 0
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Net Balance — this month</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Fees − Expenses − Payroll
              </p>
            </div>
            <p className={`text-2xl font-bold ${
              netBalance >= 0 ? 'text-green-700' : 'text-red-700'
            }`}>
              {formatGHS(netBalance)}
            </p>
          </div>
        </div>
      </CanSee>

      {/* ── Out of Stock Alert ── */}
      {stats.outOfStockItems > 0 && (
        <CanSee module="dashboard" section="alerts" element="Low Stock Alerts">
          <div className="bg-red-50 border border-red-200
                          rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <p className="font-semibold text-red-700">Out of Stock Alert</p>
              <p className="text-red-600 text-sm">
                {stats.outOfStockItems} item(s) completely out of stock.
                Please restock immediately.
              </p>
            </div>
          </div>
          {stats.lowStockItems > 0 && (
            <div className="bg-orange-50 border border-orange-200
                            rounded-xl p-4 flex items-center gap-3 mt-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-semibold text-orange-700">Low Stock Alert</p>
                <p className="text-orange-600 text-sm">
                  {stats.lowStockItems} item(s) below minimum stock level.
                  Please check the Stock page.
                </p>
              </div>
            </div>
          )}
        </CanSee>
      )}
    </div>
  )
}