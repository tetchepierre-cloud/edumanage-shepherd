// src/pages/StudentsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import { CanAct, CanSee } from '../components/PermissionGate'

const FEE_TYPES = ['tuition', 'exam', 'canteen', 'transport', 'uniform', 'other'];

export default function StudentsPage() {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [form, setForm] = useState({
    first_name: '', last_name: '', class_id: '', date_of_birth: '',
    gender: '', parent_name: '', parent_phone: '',
    address: '', active: true, min_payment_override: ''
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // ── Onglets du modal ────────────────────────────────────────────────────
  const [modalTab, setModalTab] = useState('info') // 'info' | 'discounts'

  // ── État pour les réductions ───────────────────────────────────────────
  const [discounts, setDiscounts] = useState([])
  const [loadingDiscounts, setLoadingDiscounts] = useState(false)

  useEffect(() => {
    fetchClasses()
    fetchStudents()
  }, [])

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .order('name')
    setClasses(data || [])
  }

  const fetchStudents = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('*, classes(name)')
      .order('first_name')
    if (error) console.error(error)
    setStudents(data || [])
    setLoading(false)
  }

  // ── Chargement des réductions pour un élève et son niveau ──────────────
  const loadDiscounts = async (student) => {
    setLoadingDiscounts(true)
    if (!student.classes?.name) {
      setDiscounts([])
      setLoadingDiscounts(false)
      return
    }
    const className = student.classes.name.trim()
    const levelName = className.replace(/\s*[A-Za-z]$/, '').trim()

    const { data: level } = await supabase
      .from('levels')
      .select('id')
      .ilike('name', levelName)
      .maybeSingle()
    if (!level) {
      setDiscounts([])
      setLoadingDiscounts(false)
      return
    }

    const academicYear = '2025/2026'
    const { data: fees } = await supabase
      .from('fee_structure')
      .select('id, fee_name, fee_type, amount, term')
      .eq('level_id', level.id)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('term')
      .order('fee_name')

    const { data: existingDiscounts } = await supabase
      .from('student_fee_discounts')
      .select('*')
      .eq('student_id', student.id)

    const discountMap = {}
    ;(existingDiscounts || []).forEach(d => {
      discountMap[d.fee_structure_id] = d
    })

    const list = (fees || []).map(fee => ({
      fee_structure_id: fee.id,
      fee_name: fee.fee_name,
      term: fee.term,
      annual_amount: parseFloat(fee.amount),
      discount_type: discountMap[fee.id]?.discount_type || 'percentage',
      discount_value: discountMap[fee.id]?.discount_value || 0,
    }))

    setDiscounts(list)
    setLoadingDiscounts(false)
  }

  // ── Sauvegarde d'une réduction ─────────────────────────────────────────
  const saveDiscount = async (discount) => {
    const { fee_structure_id, discount_type, discount_value } = discount
    const numValue = parseFloat(discount_value) || 0
    if (numValue < 0) {
      setMessage('❌ Discount value cannot be negative.')
      return
    }

    if (numValue === 0) {
      const { error } = await supabase
        .from('student_fee_discounts')
        .delete()
        .eq('student_id', editStudent.id)
        .eq('fee_structure_id', fee_structure_id)
      if (!error) {
        setDiscounts(prev => prev.map(d =>
          d.fee_structure_id === fee_structure_id ? { ...d, discount_value: 0 } : d
        ))
      }
      return
    }

    const { error } = await supabase
      .from('student_fee_discounts')
      .upsert({
        student_id: editStudent.id,
        fee_structure_id,
        discount_type,
        discount_value: numValue,
      }, { onConflict: 'student_id, fee_structure_id' })

    if (error) {
      setMessage('❌ Failed to save discount: ' + error.message)
    } else {
      setMessage('✅ Discount saved!')
      setDiscounts(prev => prev.map(d =>
        d.fee_structure_id === fee_structure_id ? { ...d, discount_type, discount_value: numValue } : d
      ))
    }
  }

  const openAddForm = () => {
    setEditStudent(null)
    setForm({
      first_name: '', last_name: '', class_id: '', date_of_birth: '',
      gender: '', parent_name: '', parent_phone: '',
      address: '', active: true, min_payment_override: ''
    })
    setMessage('')
    setModalTab('info')
    setShowForm(true)
  }

  const openEditForm = (student) => {
    setEditStudent(student)
    setForm({
      first_name:    student.first_name    || '',
      last_name:     student.last_name     || '',
      class_id:      student.class_id      || '',
      date_of_birth: student.date_of_birth || '',
      gender:        student.gender        || '',
      parent_name:   student.parent_name   || '',
      parent_phone:  student.parent_phone  || '',
      address:       student.address       || '',
      active:        student.active ?? true,
      min_payment_override: student.min_payment_override || ''
    })
    setMessage('')
    setModalTab('info')
    loadDiscounts(student)
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    // Validation du numéro de téléphone (10 chiffres exactement, si fourni)
    if (form.parent_phone.trim() && !/^\d{10}$/.test(form.parent_phone.trim())) {
      setMessage('❌ Phone number must be exactly 10 digits.')
      setSaving(false)
      return
    }

    const payload = {
      first_name:    form.first_name.trim(),
      last_name:     form.last_name.trim(),
      class_id:      form.class_id      || null,
      date_of_birth: form.date_of_birth || null,
      gender:        form.gender        || null,
      parent_name:   form.parent_name.trim()  || null,
      parent_phone:  form.parent_phone.trim() || null,
      address:       form.address.trim()      || null,
      active:        form.active,
      min_payment_override: form.min_payment_override ? parseFloat(form.min_payment_override) : null,
    }

    try {
      if (editStudent) {
        const oldStudent = students.find(s => s.id === editStudent.id)
        const { data, error } = await supabase
          .from('students')
          .update(payload)
          .eq('id', editStudent.id)
          .select()
          .single()

        if (error) throw error

        await logAction({
          action:      'UPDATE',
          tableName:   'students',
          recordId:    data.id,
          oldData:     oldStudent,
          newData:     data,
          description: `Updated student ${data.first_name} ${data.last_name}`,
        })

        setMessage('✅ Student updated successfully!')

      } else {
        const { data, error } = await supabase
          .from('students')
          .insert([payload])
          .select()
          .single()

        if (error) throw error

        await logAction({
          action:      'CREATE',
          tableName:   'students',
          recordId:    data.id,
          oldData:     null,
          newData:     data,
          description: `Added student ${data.first_name} ${data.last_name}`,
        })

        setMessage('✅ Student added successfully!')
      }

      await fetchStudents()
      setTimeout(() => setShowForm(false), 1200)

    } catch (error) {
      setMessage(`❌ Error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this student?')) return

    const studentToDelete = students.find(s => s.id === id)

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id)

    if (!error) {
      await logAction({
        action:      'DELETE',
        tableName:   'students',
        recordId:    id,
        oldData:     studentToDelete,
        newData:     null,
        description: `Deleted student ${studentToDelete.first_name} ${studentToDelete.last_name}`,
      })

      setStudents(prev => prev.filter(s => s.id !== id))
      setMessage('✅ Student deleted.')
    } else {
      setMessage(`❌ Error: ${error.message}`)
    }
  }

  const filtered = students.filter(s => {
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    const matchSearch =
      fullName.includes(search.toLowerCase()) ||
      s.parent_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.parent_phone?.includes(search)
    const matchClass = filterClass ? s.class_id === filterClass : true
    return matchSearch && matchClass
  })

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Students</h2>
          <p className="text-gray-500 text-sm">{students.length} students enrolled</p>
        </div>
        <CanAct module="students" section="header" element="Add Student button">
          <button
            onClick={openAddForm}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2
                       rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            ➕ Add Student
          </button>
        </CanAct>
      </div>

      {/* ── Message hors modal ── */}
      {message && !showForm && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.includes('❌')
            ? 'bg-red-50 text-red-600'
            : 'bg-green-50 text-green-600'
        }`}>
          {message}
        </div>
      )}

      {/* ── Filtres ── */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3">
        <CanSee module="students" section="filters" element="Search field">
          <input
            type="text"
            placeholder="🔍 Search by name, parent or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 px-4 py-2 border border-gray-300
                       rounded-lg focus:ring-2 focus:ring-blue-500
                       outline-none text-sm"
          />
        </CanSee>
        <CanSee module="students" section="filters" element="Class select">
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg
                       focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          >
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </CanSee>
        <button
          onClick={() => { setSearch(''); setFilterClass('') }}
          className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm
                     border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Clear
        </button>
      </div>

      {/* ── Tableau ── */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10
                            border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500">Loading students...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-2">👨‍🎓</p>
            <p className="text-gray-500">No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left text-xs font-medium
                               text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-4">#</th>
                  <th className="px-6 py-4">Full Name</th>
                  <th className="px-6 py-4">Class</th>
                  <th className="px-6 py-4">Gender</th>
                  <th className="px-6 py-4">Parent</th>
                  <th className="px-6 py-4">Phone</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((student, index) => (
                  <tr
                    key={student.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {student.first_name} {student.last_name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {student.classes?.name || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {student.gender || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {student.parent_name || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {student.parent_phone || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs
                                        font-medium rounded-full ${
                        student.active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {student.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <CanAct module="students" section="table" element="Edit button">
                          <button
                            onClick={() => openEditForm(student)}
                            className="text-blue-600 hover:text-blue-800
                                       text-sm font-medium"
                          >
                            ✏️ Edit
                          </button>
                        </CanAct>
                        <CanAct module="students" section="table" element="Delete button">
                          <button
                            onClick={() => handleDelete(student.id)}
                            className="text-red-500 hover:text-red-700
                                       text-sm font-medium"
                          >
                            🗑️ Delete
                          </button>
                        </CanAct>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Formulaire (avec onglets) ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50
                        flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full
                          max-w-2xl max-h-[90vh] overflow-y-auto">

            <div className="p-6 border-b flex items-center justify-between
                            sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                {editStudent ? '✏️ Edit Student' : '➕ Add New Student'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* Onglets (uniquement en édition) */}
            {editStudent && (
              <div className="flex gap-2 px-6 pt-4 border-b pb-2">
                <CanAct module="students" section="modal" element="Info tab">
                  <button
                    onClick={() => setModalTab('info')}
                    className={`px-3 py-1 rounded text-sm font-medium ${modalTab === 'info' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >Info</button>
                </CanAct>
                <CanAct module="students" section="modal" element="Discounts tab">
                  <button
                    onClick={() => setModalTab('discounts')}
                    className={`px-3 py-1 rounded text-sm font-medium ${modalTab === 'discounts' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >Discounts</button>
                </CanAct>
              </div>
            )}

            {modalTab === 'info' && (
              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input type="text" required value={form.first_name}
                      onChange={e => setForm({ ...form, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="e.g. Kofi" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input type="text" required value={form.last_name}
                      onChange={e => setForm({ ...form, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="e.g. Mensah" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                    <select required value={form.class_id}
                      onChange={e => setForm({ ...form, class_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                      <option value="">Select class</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input type="date" value={form.date_of_birth}
                      onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    <p className="text-xs text-gray-400 mt-1">Format: JJ/MM/AAAA</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                    <select value={form.gender}
                      onChange={e => setForm({ ...form, gender: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={form.active}
                      onChange={e => setForm({ ...form, active: e.target.value === 'true' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Min. Payment Override (GHS)</label>
                    <input type="number" step="0.01" min="0"
                      value={form.min_payment_override}
                      onChange={e => setForm({ ...form, min_payment_override: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="Leave empty for default" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent / Guardian Name</label>
                    <input type="text" value={form.parent_name}
                      onChange={e => setForm({ ...form, parent_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="e.g. Ama Mensah" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent Phone</label>
                    <input type="tel" value={form.parent_phone}
                      onChange={e => setForm({ ...form, parent_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="e.g. 0244000000" />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" value={form.address}
                      onChange={e => setForm({ ...form, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="e.g. Tamale, Northern Region" />
                  </div>

                </div>

                {message && (
                  <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
                    message.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    {message}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50">
                    {saving ? '⏳ Saving...' : editStudent ? '✅ Update Student' : '✅ Add Student'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* ── Onglet Discounts ── */}
            {modalTab === 'discounts' && (
              <div className="p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">Fee Adjustments for {editStudent?.first_name} {editStudent?.last_name}</h3>
                {loadingDiscounts ? (
                  <p className="text-gray-500 text-sm">Loading fees...</p>
                ) : discounts.length === 0 ? (
                  <p className="text-gray-400 text-sm">No fees configured for this student's level.</p>
                ) : (
                  <div className="space-y-4 max-h-64 overflow-y-auto">
                    {discounts.map((discount, idx) => (
                      <div key={idx} className="border rounded-lg p-3 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{discount.fee_name}</p>
                          <p className="text-xs text-gray-500">{discount.term || 'Term ?'} · GHS {discount.annual_amount.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={discount.discount_type}
                            onChange={e => {
                              const newList = [...discounts]
                              newList[idx].discount_type = e.target.value
                              setDiscounts(newList)
                            }}
                            className="border rounded px-2 py-1 text-sm"
                          >
                            <option value="percentage">%</option>
                            <option value="fixed">Fixed</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={discount.discount_value}
                            onChange={e => {
                              const newList = [...discounts]
                              newList[idx].discount_value = e.target.value
                              setDiscounts(newList)
                            }}
                            className="w-24 border rounded px-2 py-1 text-sm text-right"
                          />
                          <button
                            onClick={() => saveDiscount(discount)}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowForm(false)} className="text-sm text-blue-600 hover:underline">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}