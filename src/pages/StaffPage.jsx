// src/pages/StaffPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const POSITIONS = ['Teacher', 'Headmaster', 'Secretary', 'Accountant', 'Janitor', 'Security', 'Cook', 'Other']
const GENDERS   = ['Male', 'Female', 'Other']  // ✅ AJOUTÉ

const emptyForm = {
  first_name:  '',
  last_name:   '',
  position:    'Teacher',
  gender:      'Female',   // ✅ AJOUTÉ
  phone:       '',
  email:       '',
  base_salary: '',
  hire_date:   new Date().toISOString().split('T')[0],
  active:      true,
}

export default function StaffPage() {
  const [staff, setStaff]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editingStaff, setEditing]  = useState(null)
  const [form, setForm]             = useState(emptyForm)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPos, setFilterPos]   = useState('all')
  const [filterActive, setFilterActive] = useState('all')

  // ── Fetch ──────────────────────────────────────────────────
  const fetchStaff = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('last_name', { ascending: true })

    if (error) {
      setError('Failed to load staff: ' + error.message)
    } else {
      setStaff(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchStaff() }, [])

  // ── Helpers ────────────────────────────────────────────────
  const showSuccess = (msg) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3000)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (member) => {
    setEditing(member)
    setForm({
      first_name:  member.first_name,
      last_name:   member.last_name,
      position:    member.position,
      gender:      member.gender || 'Female',   // ✅ AJOUTÉ
      phone:       member.phone || '',
      email:       member.email || '',
      base_salary: member.base_salary || '',
      hire_date:   member.hire_date || new Date().toISOString().split('T')[0],
      active:      member.active,
    })
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
    setError('')
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required.')
      setSaving(false)
      return
    }
    if (!form.position) {
      setError('Position is required.')
      setSaving(false)
      return
    }
    if (form.base_salary && isNaN(parseFloat(form.base_salary))) {
      setError('Base salary must be a valid number.')
      setSaving(false)
      return
    }

    const payload = {
      first_name:  form.first_name.trim(),
      last_name:   form.last_name.trim(),
      position:    form.position,
      gender:      form.gender,               // ✅ AJOUTÉ
      phone:       form.phone.trim() || null,
      email:       form.email.trim() || null,
      base_salary: form.base_salary ? parseFloat(form.base_salary) : 0,
      hire_date:   form.hire_date || null,
      active:      form.active,
    }

    let result
    if (editingStaff) {
      result = await supabase
        .from('staff')
        .update(payload)
        .eq('id', editingStaff.id)
    } else {
      result = await supabase
        .from('staff')
        .insert([payload])
    }

    if (result.error) {
      setError('Save failed: ' + result.error.message)
    } else {
      showSuccess(editingStaff ? '✅ Staff member updated!' : '✅ Staff member added!')
      closeModal()
      fetchStaff()
    }
    setSaving(false)
  }

  // ── Toggle Active ──────────────────────────────────────────
  const toggleActive = async (member) => {
    const { error } = await supabase
      .from('staff')
      .update({ active: !member.active })
      .eq('id', member.id)

    if (error) {
      setError('Update failed: ' + error.message)
    } else {
      showSuccess(`✅ ${member.first_name} marked as ${!member.active ? 'Active' : 'Inactive'}`)
      fetchStaff()
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (member) => {
    if (!confirm(`Delete ${member.first_name} ${member.last_name}? This cannot be undone.`)) return

    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('id', member.id)

    if (error) {
      setError('Delete failed: ' + error.message)
    } else {
      showSuccess('✅ Staff member deleted.')
      fetchStaff()
    }
  }

  // ── Filter ─────────────────────────────────────────────────
  const filtered = staff.filter(m => {
    const fullName = `${m.first_name} ${m.last_name}`.toLowerCase()
    const matchSearch = fullName.includes(searchTerm.toLowerCase()) ||
                        (m.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (m.phone || '').includes(searchTerm)
    const matchPos    = filterPos === 'all' || m.position === filterPos
    const matchActive = filterActive === 'all' ||
                        (filterActive === 'active' && m.active) ||
                        (filterActive === 'inactive' && !m.active)
    return matchSearch && matchPos && matchActive
  })

  // ── Stats ──────────────────────────────────────────────────
  const totalStaff    = staff.length
  const activeStaff   = staff.filter(m => m.active).length
  const totalSalaries = staff
    .filter(m => m.active)
    .reduce((sum, m) => sum + parseFloat(m.base_salary || 0), 0)
  const teachers      = staff.filter(m => m.position === 'Teacher' && m.active).length

  // ── Gender badge color ─────────────────────────────────────
  const genderBadge = (gender) => {
    switch (gender) {
      case 'Male':   return 'bg-blue-100 text-blue-800'
      case 'Female': return 'bg-pink-100 text-pink-800'
      default:       return 'bg-gray-100 text-gray-600'
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage school staff and employees</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg
                     font-medium flex items-center gap-2 transition-colors"
        >
          <span>➕</span> Add Staff Member
        </button>
      </div>

      {/* Alerts */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}
      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-gray-500 text-sm">Total Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalStaff}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-gray-500 text-sm">Active</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{activeStaff}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-gray-500 text-sm">Teachers</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{teachers}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-gray-500 text-sm">Monthly Salaries</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            GHS {totalSalaries.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2
                       text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterPos}
            onChange={e => setFilterPos(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Positions</option>
            {POSITIONS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={e => setFilterActive(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2
                            border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Loading staff...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-gray-500">No staff members found.</p>
            <button
              onClick={openAdd}
              className="mt-3 text-blue-600 hover:underline text-sm"
            >
              Add your first staff member
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Position</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Gender</th>
                  {/* ✅ AJOUTÉ */}
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Base Salary</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Hire Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((member, idx) => (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {member.first_name} {member.last_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5
                                       rounded-full text-xs font-medium">
                        {member.position}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {/* ✅ AJOUTÉ */}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                                        ${genderBadge(member.gender)}`}>
                        {member.gender || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{member.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{member.email || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      GHS {parseFloat(member.base_salary || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {member.hire_date
                        ? new Date(member.hire_date).toLocaleDateString('en-GB')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${member.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'}`}>
                        {member.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(member)}
                          className="text-blue-600 hover:text-blue-800 text-xs
                                     font-medium hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(member)}
                          className="text-yellow-600 hover:text-yellow-800 text-xs
                                     font-medium hover:underline"
                        >
                          {member.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDelete(member)}
                          className="text-red-600 hover:text-red-800 text-xs
                                     font-medium hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Count */}
      {!loading && (
        <p className="text-gray-500 text-sm text-right">
          Showing {filtered.length} of {totalStaff} staff member{totalStaff !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh]
                          overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingStaff ? '✏️ Edit Staff Member' : '➕ Add Staff Member'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700
                                px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={e => setForm({ ...form, first_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ama"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={e => setForm({ ...form, last_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Serwaa"
                  />
                </div>
              </div>

              {/* Position + Gender */}
              {/* ✅ AJOUTÉ Gender dans la même ligne que Position */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Position <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.position}
                    onChange={e => setForm({ ...form, position: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {POSITIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.gender}
                    onChange={e => setForm({ ...form, gender: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {GENDERS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="024 000 0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ama@school.edu.gh"
                  />
                </div>
              </div>

              {/* Salary + Hire Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Salary (GHS)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.base_salary}
                    onChange={e => setForm({ ...form, base_salary: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="1500.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hire Date
                  </label>
                  <input
                    type="date"
                    value={form.hire_date}
                    onChange={e => setForm({ ...form, hire_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="active"
                  checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="active" className="text-sm font-medium text-gray-700">
                  Active (currently employed)
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg
                             text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                             text-white py-2 rounded-lg text-sm font-medium
                             transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4
                                      border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    editingStaff ? '💾 Update' : '➕ Add Staff'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
