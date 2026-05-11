// src/pages/ExpensesPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import { CanAct, CanSee } from '../components/PermissionGate'  // ← ajouté

const CATEGORIES = [
  { value: 'books_textbooks',    label: 'Books & Textbooks'    },
  { value: 'stationery',         label: 'Stationery'           },
  { value: 'furniture',          label: 'Furniture'            },
  { value: 'electronics',        label: 'Electronics'          },
  { value: 'ict_equipment',      label: 'ICT Equipment'        },
  { value: 'cleaning_supplies',  label: 'Cleaning Supplies'    },
  { value: 'sports_pe',          label: 'Sports & P.E.'        },
  { value: 'canteen_feeding',    label: 'Canteen / Feeding'    },
  { value: 'art_creative',       label: 'Art & Creative'       },
  { value: 'uniforms_clothing',  label: 'Uniforms & Clothing'  },
  { value: 'health_first_aid',   label: 'Health & First Aid'   },
  { value: 'transport',          label: 'Transport'            },
  { value: 'general_supplies',   label: 'General Supplies'     },
  { value: 'other',              label: 'Other'                },
];

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash'          },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money',  label: 'Mobile Money'  },
  { value: 'cheque',        label: 'Cheque'        },
]

const STATUSES = [
  { value: 'pending',  label: 'Pending'  },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const initialForm = {
  description:    '',
  amount:         '',
  category:       'utilities',
  payment_method: 'cash',
  receipt_number: '',
  status:         'pending',
  notes:          '',
}

export default function ExpensesPage() {
  const [expenses,       setExpenses]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [formData,       setFormData]       = useState(initialForm)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [editingId,      setEditingId]      = useState(null)
  const [deleteConfirm,  setDeleteConfirm]  = useState(null)

  useEffect(() => { fetchExpenses() }, [])

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchExpenses = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setExpenses(data || [])
    } catch (err) {
      setError('Failed to load expenses: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      if (!formData.description.trim()) throw new Error('Description is required')
      if (!formData.amount || parseFloat(formData.amount) <= 0)
        throw new Error('Valid amount is required')

      const payload = {
        description:    formData.description.trim(),
        amount:         parseFloat(formData.amount),
        category:       formData.category,
        payment_method: formData.payment_method,
        receipt_number: formData.receipt_number.trim() || null,
        status:         formData.status,
        notes:          formData.notes.trim() || null,
      }

      if (editingId) {
        const oldExpense = expenses.find(e => e.id === editingId)
        const { data, error } = await supabase
          .from('expenses')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId)
          .select()
          .single()
        if (error) throw error

        await logAction({
          action:      'UPDATE',
          tableName:   'expenses',
          recordId:    data.id,
          oldData:     oldExpense,
          newData:     data,
          description: `Updated expense — "${data.description}" · `
                     + `GHS ${data.amount} · ${data.category} · ${data.status}`,
        })
        setSuccess('Expense updated successfully!')
      } else {
        const { data, error } = await supabase
          .from('expenses')
          .insert([payload])
          .select()
          .single()
        if (error) throw error

        await logAction({
          action:      'CREATE',
          tableName:   'expenses',
          recordId:    data.id,
          oldData:     null,
          newData:     data,
          description: `New expense — "${data.description}" · `
                     + `GHS ${data.amount} · ${data.category} · ${data.status}`,
        })
        setSuccess('Expense recorded successfully!')
      }

      await fetchExpenses()
      setShowModal(false)
      setFormData(initialForm)
      setEditingId(null)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (expense) => {
    setFormData({
      description:    expense.description    || '',
      amount:         expense.amount         || '',
      category:       expense.category       || 'utilities',
      payment_method: expense.payment_method || 'cash',
      receipt_number: expense.receipt_number || '',
      status:         expense.status         || 'pending',
      notes:          expense.notes          || '',
    })
    setEditingId(expense.id)
    setError('')
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    const expenseToDelete = expenses.find(e => e.id === id)
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
      if (error) throw error

      await logAction({
        action:      'DELETE',
        tableName:   'expenses',
        recordId:    id,
        oldData:     expenseToDelete,
        newData:     null,
        description: `Deleted expense — "${expenseToDelete?.description}" · `
                   + `GHS ${expenseToDelete?.amount} · ${expenseToDelete?.category}`,
      })
      setSuccess('Expense deleted successfully!')
      setDeleteConfirm(null)
      await fetchExpenses()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Failed to delete: ' + err.message)
      setDeleteConfirm(null)
    }
  }

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const openAddModal = () => {
    setFormData(initialForm)
    setEditingId(null)
    setError('')
    setShowModal(true)
  }

  // ── Filters ───────────────────────────────────────────────────────────────────

  const filtered = expenses.filter(exp => {
    const catMatch    = filterCategory === 'all' || exp.category === filterCategory
    const statusMatch = filterStatus   === 'all' || exp.status   === filterStatus
    return catMatch && statusMatch
  })

  // ── Stats ─────────────────────────────────────────────────────────────────────

  const totalAll = expenses
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
  const totalApproved = expenses
    .filter(e => e.status === 'approved')
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
  const totalPending = expenses
    .filter(e => e.status === 'pending')
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
  const totalThisMonth = expenses
    .filter(e => {
      const d   = new Date(e.created_at)
      const now = new Date()
      return d.getMonth()    === now.getMonth() &&
             d.getFullYear() === now.getFullYear()
    })
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)

  // ── Utilities ────────────────────────────────────────────────────────────────

  const getCategoryLabel = val =>
    CATEGORIES.find(c => c.value === val)?.label || val
  const getPaymentLabel = val =>
    PAYMENT_METHODS.find(p => p.value === val)?.label || val
  const formatDate = dateStr =>
    dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : '—'
  const formatAmount = amount =>
    `GHS ${parseFloat(amount || 0).toFixed(2)}`
  const getStatusBadge = (status) => {
    const map = {
      approved: 'bg-green-100 text-green-800',
      pending:  'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium
                        ${map[status] || 'bg-gray-100 text-gray-800'}`}>
        {STATUSES.find(s => s.value === status)?.label || status}
      </span>
    )
  }
  const getCategoryBadge = (category) => {
    const colors = {
      utilities:   'bg-blue-100 text-blue-800',
      salaries:    'bg-purple-100 text-purple-800',
      supplies:    'bg-orange-100 text-orange-800',
      maintenance: 'bg-red-100 text-red-800',
      transport:   'bg-cyan-100 text-cyan-800',
      food:        'bg-green-100 text-green-800',
      other:       'bg-gray-100 text-gray-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium
                        ${colors[category] || colors.other}`}>
        {getCategoryLabel(category)}
      </span>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500 text-sm mt-1">
            Track and manage school expenses
          </p>
        </div>
        <CanAct module="expenses" section="header" element="Add Expense button">
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2
                       rounded-lg flex items-center gap-2 transition-colors"
          >
            <span className="text-lg font-bold">+</span>
            Add Expense
          </button>
        </CanAct>
      </div>

      {/* ── Alerts ── */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800
                        px-4 py-3 rounded-lg flex items-center gap-2">
          ✅ {success}
        </div>
      )}
      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 text-red-800
                        px-4 py-3 rounded-lg flex items-center gap-2">
          ❌ {error}
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Total Expenses</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatAmount(totalAll)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{expenses.length} records</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Approved</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatAmount(totalApproved)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {expenses.filter(e => e.status === 'approved').length} records
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">
            {formatAmount(totalPending)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {expenses.filter(e => e.status === 'pending').length} records
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">This Month</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {formatAmount(totalThisMonth)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date().toLocaleString('en-GB', {
              month: 'long', year: 'numeric'
            })}
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <CanSee module="expenses" section="filters" element="Category select">
            <div>
              <label className="text-sm text-gray-600 mr-2">Category:</label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </CanSee>
          <CanSee module="expenses" section="filters" element="Status select">
            <div>
              <label className="text-sm text-gray-600 mr-2">Status:</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </CanSee>
          <div className="ml-auto text-sm text-gray-500">
            {filtered.length} expense{filtered.length !== 1 ? 's' : ''} found
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <CanSee module="expenses" section="table" element="Expense rows">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8
                              border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-500">Loading expenses...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-gray-500 font-medium">No expenses found</p>
              <p className="text-gray-400 text-sm mt-1">
                Click "Add Expense" to record your first expense
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Method</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Receipt</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((expense, index) => (
                    <tr
                      key={expense.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {expense.description}
                        </p>
                        {expense.notes && (
                          <p className="text-xs text-gray-400 mt-0.5
                                        truncate max-w-xs">
                            {expense.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {getCategoryBadge(expense.category)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {getPaymentLabel(expense.payment_method)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {expense.receipt_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatAmount(expense.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(expense.status)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(expense.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <CanAct module="expenses" section="table" element="Edit button">
                            <button
                              onClick={() => handleEdit(expense)}
                              className="text-blue-600 hover:text-blue-800 text-xs
                                         font-medium px-2 py-1 rounded
                                         hover:bg-blue-50 transition-colors"
                            >
                              ✏️ Edit
                            </button>
                          </CanAct>
                          <CanAct module="expenses" section="table" element="Delete button">
                            <button
                              onClick={() => setDeleteConfirm(expense.id)}
                              className="text-red-600 hover:text-red-800 text-xs
                                         font-medium px-2 py-1 rounded
                                         hover:bg-red-50 transition-colors"
                            >
                              🗑️ Delete
                            </button>
                          </CanAct>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 font-semibold text-gray-600">
                      Total ({filtered.length} items)
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {formatAmount(
                        filtered.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
                      )}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </CanSee>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50
                        flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full
                          max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b
                            border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? '✏️ Edit Expense' : '➕ Add New Expense'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setError('') }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {/* Error dans modal */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700
                                px-4 py-3 rounded-lg text-sm">
                  ❌ {error}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="e.g. Electricity Bill - March 2025"
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500
                             text-sm"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (GHS) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500
                             text-sm"
                />
              </div>

              {/* Category & Payment Method */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               text-sm"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    name="payment_method"
                    value={formData.payment_method}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               text-sm"
                  >
                    {PAYMENT_METHODS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Receipt Number & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Receipt Number
                  </label>
                  <input
                    type="text"
                    name="receipt_number"
                    value={formData.receipt_number}
                    onChange={handleChange}
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               text-sm"
                  >
                    {STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Additional details (optional)"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500
                             text-sm resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError('') }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2
                             rounded-lg hover:bg-gray-50 transition-colors
                             text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700
                             disabled:bg-blue-400 text-white py-2 rounded-lg
                             transition-colors text-sm font-medium
                             flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4
                                      border-b-2 border-white" />
                      Saving...
                    </>
                  ) : (
                    editingId ? '✅ Update Expense' : '✅ Save Expense'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50
                        flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="text-center">
              <p className="text-4xl mb-3">🗑️</p>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Delete Expense?
              </h3>
              <p className="text-gray-500 text-sm mb-2">
                <span className="font-medium text-gray-700">
                  {expenses.find(e => e.id === deleteConfirm)?.description}
                </span>
              </p>
              <p className="text-gray-400 text-sm mb-6">
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2
                             rounded-lg hover:bg-gray-50 transition-colors
                             text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2
                             rounded-lg transition-colors text-sm font-medium"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}