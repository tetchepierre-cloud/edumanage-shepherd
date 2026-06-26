// src/pages/PayrollPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import { CanAct, CanSee } from '../components/PermissionGate'

const ROLES = [
  'Teacher', 'Administrator', 'Security',
  'Cleaner', 'Cook', 'Driver', 'Other'
]
const MONTHS = [
  'January', 'February', 'March',    'April',   'May',      'June',
  'July',    'August',   'September','October', 'November', 'December'
]
const STATUS_OPTIONS = ['pending', 'paid', 'cancelled']

const defaultForm = {
  staff_id:       '',
  employee_name:  '',
  role:           '',
  base_salary:    '',
  bonuses:        '0',
  deductions:     '0',
  month:          '',
  year:           '',
  payment_date:   '',
  payment_method: 'cash',
  status:         'pending',
  notes:          '',
}

export default function PayrollPage() {
  const [payroll,       setPayroll]       = useState([])
  const [staffList,     setStaffList]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [editItem,      setEditItem]      = useState(null)
  const [search,        setSearch]        = useState('')
  const [filterMonth,   setFilterMonth]   = useState('')
  const [filterRole,    setFilterRole]    = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [saving,        setSaving]        = useState(false)
  const [message,       setMessage]       = useState('')
  const [form,          setForm]          = useState(defaultForm)

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  useEffect(() => {
    fetchPayroll()
    fetchStaff()
  }, [])

  const fetchPayroll = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('payroll')
      .select('*')
      .order('year',  { ascending: false })
      .order('month', { ascending: false })
    if (error) console.error('fetchPayroll error:', error)
    setPayroll(data || [])
    setLoading(false)
  }

  const fetchStaff = async () => {
    const { data } = await supabase
      .from('staff')
      .select('id, first_name, last_name, position, base_salary')
      .eq('active', true)
      .order('first_name')
    setStaffList(data || [])
  }

  const handleStaffSelect = (e) => {
    const selectedId = e.target.value
    if (!selectedId) {
      setForm(f => ({ ...f, staff_id: '', employee_name: '', role: '', base_salary: '' }))
      return
    }
    const staff = staffList.find(s => s.id === selectedId)
    if (!staff) return

    const roleMap = {
      Teacher:    'Teacher',
      Headmaster: 'Administrator',
      Secretary:  'Administrator',
      Accountant: 'Administrator',
      Janitor:    'Cleaner',
      Security:   'Security',
      Cook:       'Cook',
      Other:      'Other',
    }
    setForm(f => ({
      ...f,
      staff_id:      staff.id,
      employee_name: `${staff.first_name} ${staff.last_name}`,
      role:          roleMap[staff.position] || 'Other',
      base_salary:   staff.base_salary || '',
    }))
  }

  const openAddForm = () => {
    setEditItem(null)
    const now = new Date()
    setForm({
      ...defaultForm,
      month: String(now.getMonth() + 1),
      year:  String(now.getFullYear()),
    })
    setMessage('')
    setShowForm(true)
  }

  const openEditForm = (item) => {
    setEditItem(item)
    setForm({
      staff_id:       item.staff_id       || '',
      employee_name:  item.employee_name  || '',
      role:           item.role           || '',
      base_salary:    item.base_salary    || '',
      bonuses:        item.bonuses        ?? '0',
      deductions:     item.deductions     ?? '0',
      month:          item.month          || '',
      year:           item.year           || '',
      payment_date:   item.payment_date   || '',
      payment_method: item.payment_method || 'cash',
      status:         item.status         || 'pending',
      notes:          item.notes          || '',
    })
    setMessage('')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const base       = parseFloat(form.base_salary) || 0
      const bonuses    = parseFloat(form.bonuses)     || 0
      const deductions = parseFloat(form.deductions)  || 0
      const net_salary = base + bonuses - deductions

      const payload = {
        staff_id:       form.staff_id       || null,
        employee_name:  form.employee_name.trim(),
        role:           form.role,
        base_salary:    base,
        bonuses:        bonuses,
        deductions:     deductions,
        net_salary:     net_salary,
        month:          parseInt(form.month),
        year:           parseInt(form.year),
        payment_date:   form.payment_date   || null,
        payment_method: form.payment_method,
        status:         form.status,
        notes:          form.notes          || null,
      }

      if (editItem) {
        const oldItem = payroll.find(p => p.id === editItem.id)
        const { data, error } = await supabase
          .from('payroll')
          .update(payload)
          .eq('id', editItem.id)
          .select()
          .single()

        if (error) throw error

        await logAction({
          action:      'UPDATE',
          tableName:   'payroll',
          recordId:    data.id,
          oldData:     oldItem,
          newData:     data,
          description: `Updated payroll — ${data.employee_name} · `
                     + `${MONTHS[(data.month || 1) - 1]} ${data.year} · `
                     + `Net: GHS ${data.net_salary} · ${data.status}`,
        })

        setMessage('✅ Payroll record updated!')

      } else {
        const { data, error } = await supabase
          .from('payroll')
          .insert([payload])
          .select()
          .single()

        if (error) throw error

        await logAction({
          action:      'CREATE',
          tableName:   'payroll',
          recordId:    data.id,
          oldData:     null,
          newData:     data,
          description: `New payroll — ${data.employee_name} · `
                     + `${MONTHS[(data.month || 1) - 1]} ${data.year} · `
                     + `Net: GHS ${data.net_salary} · ${data.status}`,
        })

        setMessage('✅ Payroll record added!')
      }

      await fetchPayroll()
      setTimeout(() => setShowForm(false), 1000)

    } catch (err) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payroll record?')) return

    const itemToDelete = payroll.find(p => p.id === id)

    const { error } = await supabase
      .from('payroll')
      .delete()
      .eq('id', id)

    if (!error) {
      await logAction({
        action:      'DELETE',
        tableName:   'payroll',
        recordId:    id,
        oldData:     itemToDelete,
        newData:     null,
        description: `Deleted payroll — ${itemToDelete?.employee_name} · `
                   + `${MONTHS[(itemToDelete?.month || 1) - 1]} ${itemToDelete?.year} · `
                   + `Net: GHS ${itemToDelete?.net_salary}`,
      })

      setMessage('✅ Record deleted.')
      fetchPayroll()
    } else {
      setMessage(`❌ Error: ${error.message}`)
    }
  }

  const formatGHS = (amount) =>
    new Intl.NumberFormat('en-GH', {
      style:    'currency',
      currency: 'GHS',
    }).format(amount || 0)

  const getStatusBadge = (status) => {
    const styles = {
      paid:      'bg-green-100 text-green-700',
      pending:   'bg-yellow-100 text-yellow-700',
      cancelled: 'bg-red-100 text-red-600',
    }
    return styles[status] || 'bg-gray-100 text-gray-600'
  }

  const totalMasse = payroll
    .reduce((sum, p) => sum + (parseFloat(p.net_salary) || 0), 0)

  const now = new Date()
  const thisMonth = payroll
    .filter(p => p.month === now.getMonth() + 1 && p.year === now.getFullYear())
    .reduce((sum, p) => sum + (parseFloat(p.net_salary) || 0), 0)

  const pendingCount = payroll.filter(p => p.status === 'pending').length

  const filtered = payroll.filter(p => {
    const matchSearch = p.employee_name?.toLowerCase().includes(search.toLowerCase())
    const matchMonth  = filterMonth  ? p.month  === parseInt(filterMonth) : true
    const matchRole   = filterRole   ? p.role   === filterRole            : true
    const matchStatus = filterStatus ? p.status === filterStatus          : true
    return matchSearch && matchMonth && matchRole && matchStatus
  })

  const netPreview =
    (parseFloat(form.base_salary) || 0)
    + (parseFloat(form.bonuses)   || 0)
    - (parseFloat(form.deductions)|| 0)

  return (
    <div className="space-y-6 p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payroll</h2>
          <p className="text-gray-500 text-sm">{payroll.length} payroll records</p>
        </div>
        <CanAct module="payroll" section="header" element="Add Payroll button">
          <button
            onClick={openAddForm}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2
                       rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            ➕ Add Payroll
          </button>
        </CanAct>
      </div>

      {/* ── Message global ── */}
      {message && !showForm && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          message.includes('❌')
            ? 'bg-red-50 text-red-600'
            : 'bg-green-50 text-green-600'
        }`}>
          {message}
        </div>
      )}

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-purple-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Payroll
          </p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {formatGHS(totalMasse)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            This Month
          </p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {formatGHS(thisMonth)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-yellow-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Pending
          </p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-gray-400">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Records
          </p>
          <p className="text-2xl font-bold text-gray-700 mt-1">{payroll.length}</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3">
        <CanSee module="payroll" section="filters" element="Search field">
          <input
            type="text"
            placeholder="🔍 Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 px-4 py-2 border border-gray-300
                       rounded-lg focus:ring-2 focus:ring-purple-500
                       outline-none text-sm"
          />
        </CanSee>
        <CanSee module="payroll" section="filters" element="Month select">
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg
                       focus:ring-2 focus:ring-purple-500 outline-none text-sm"
          >
            <option value="">All Months</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </CanSee>
        <CanSee module="payroll" section="filters" element="Role select">
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg
                       focus:ring-2 focus:ring-purple-500 outline-none text-sm"
          >
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </CanSee>
        <CanSee module="payroll" section="filters" element="Status select">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg
                       focus:ring-2 focus:ring-purple-500 outline-none text-sm"
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </CanSee>
        <button
          onClick={() => {
            setSearch('')
            setFilterMonth('')
            setFilterRole('')
            setFilterStatus('')
          }}
          className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm
                     border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Clear
        </button>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8
                            border-b-2 border-purple-600" />
            <span className="ml-3 text-gray-500">Loading payroll...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-2">👥</p>
            <p className="text-gray-500">No payroll records found</p>
          </div>
        ) : (
          <CanSee module="payroll" section="table" element="Payroll rows">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs font-medium
                                 text-gray-500 uppercase tracking-wide">
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Period</th>
                    <th className="px-6 py-4">Base</th>
                    <th className="px-6 py-4">Bonuses</th>
                    <th className="px-6 py-4">Deductions</th>
                    <th className="px-6 py-4">Net Salary</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {item.employee_name}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-1 text-xs
                                         font-medium rounded-full
                                         bg-purple-100 text-purple-700">
                          {item.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {MONTHS[(item.month || 1) - 1]} {item.year}
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {formatGHS(item.base_salary)}
                      </td>
                      <td className="px-6 py-4 text-green-600">
                        +{formatGHS(item.bonuses)}
                      </td>
                      <td className="px-6 py-4 text-red-500">
                        -{formatGHS(item.deductions)}
                      </td>
                      <td className="px-6 py-4 font-bold text-purple-700">
                        {formatGHS(item.net_salary)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs
                                          font-medium rounded-full capitalize
                                          ${getStatusBadge(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 capitalize">
                        {item.payment_method}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <CanAct module="payroll" section="table" element="Edit button">
                            <button
                              onClick={() => openEditForm(item)}
                              className="text-blue-600 hover:text-blue-800
                                         text-sm font-medium px-2 py-1 rounded
                                         hover:bg-blue-50"
                            >
                              ✏️ Edit
                            </button>
                          </CanAct>
                          <CanAct module="payroll" section="table" element="Delete button">
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="text-red-500 hover:text-red-700
                                         text-sm font-medium px-2 py-1 rounded
                                         hover:bg-red-50"
                            >
                              🗑️
                            </button>
                          </CanAct>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CanSee>
        )}
      </div>

      {/* ── Modal Form ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50
                        flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full
                          max-w-lg max-h-[90vh] overflow-y-auto">

            <div className="p-6 border-b flex items-center justify-between
                            sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                {editItem ? '✏️ Edit Payroll Record' : '➕ Add Payroll Record'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            <CanAct module="payroll" section="modal" element="Payroll form">
              <form onSubmit={handleSave} className="p-6 space-y-4">
                {/* Staff selector — ajout uniquement */}
                {!editItem && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Staff Member
                      </label>
                      <select
                        onChange={handleStaffSelect}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                   focus:ring-2 focus:ring-purple-500 outline-none
                                   text-sm bg-purple-50"
                      >
                        <option value="">-- Choose from staff list --</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.first_name} {s.last_name} — {s.position}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">
                        ℹ️ Auto-fills fields below
                      </p>
                    </div>
                    <div className="border-t border-dashed border-gray-200 pt-2 text-center">
                      <p className="text-xs text-gray-400">— or fill manually —</p>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Employee Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.employee_name}
                      onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                      placeholder="e.g. Kofi Mensah"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role *
                    </label>
                    <select
                      required
                      value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    >
                      <option value="">Select role</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status *
                    </label>
                    <select
                      required
                      value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Base Salary (GHS) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={form.base_salary}
                      onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bonuses (GHS)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.bonuses}
                      onChange={e => setForm(f => ({ ...f, bonuses: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Deductions (GHS)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.deductions}
                      onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Month *
                    </label>
                    <select
                      required
                      value={form.month}
                      onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    >
                      <option value="">Select month</option>
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Year *
                    </label>
                    <select
                      required
                      value={form.year}
                      onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    >
                      <option value="">Select year</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={form.payment_date}
                      onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={form.payment_method}
                      onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="momo">Mobile Money</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>

                </div>

                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-purple-600 font-medium uppercase tracking-wide">
                    Net Salary Preview
                  </p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    {formatGHS(netPreview)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatGHS(parseFloat(form.base_salary) || 0)} base
                    {' '}+ {formatGHS(parseFloat(form.bonuses) || 0)} bonus
                    {' '}- {formatGHS(parseFloat(form.deductions) || 0)} deductions
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg
                               focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    placeholder="Optional notes..."
                  />
                </div>

                {message && (
                  <div className={`px-4 py-3 rounded-lg text-sm ${
                    message.includes('❌')
                      ? 'bg-red-50 text-red-600'
                      : 'bg-green-50 text-green-600'
                  }`}>
                    {message}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white
                               font-medium py-2 rounded-lg transition-colors
                               disabled:opacity-50 flex items-center
                               justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4
                                        border-b-2 border-white" />
                        Saving...
                      </>
                    ) : (
                      editItem ? '✅ Update Record' : '✅ Add Record'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-6 py-2 border border-gray-300 text-gray-700
                               rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </CanAct>
          </div>
        </div>
      )}

    </div>
  )
}