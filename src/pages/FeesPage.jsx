// src/pages/FeesPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import { printReceipt, generateReceiptNumber } from '../lib/receiptGenerator'

const PAYMENT_TYPES  = ['Tuition', 'Uniform', 'Books', 'Exam', 'Other']
const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque']
const TERMS          = ['Term 1', 'Term 2', 'Term 3']
const ACADEMIC_YEARS = ['2024/2025', '2025/2026', '2026/2027']
const STATUSES       = ['paid', 'pending', 'partial']

export default function FeesPage() {
  const [payments,     setPayments]     = useState([])
  const [students,     setStudents]     = useState([])
  const [classes,      setClasses]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editPayment,  setEditPayment]  = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [message,      setMessage]      = useState('')

  const [search,       setSearch]       = useState('')
  const [filterClass,  setFilterClass]  = useState('')
  const [filterTerm,   setFilterTerm]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterYear,   setFilterYear]   = useState('')

  const [form, setForm] = useState({
    student_id:     '',
    amount:         '',
    payment_type:   'Tuition',
    payment_method: 'Cash',
    receipt_number: '',
    status:         'paid',
    academic_year:  '2024/2025',
    term:           'Term 1',
    notes:          '',
  })

  const [schoolConfig, setSchoolConfig] = useState({
    school_name: 'BRIGHT FUTURE SCHOOL',
    address:     'Tamale, Northern Region',
    phone:       '+233 20 000 0000',
    email:       '',
    logo:        null,
  })

  useEffect(() => { fetchAll(); loadSchoolConfig() }, [])

  const loadSchoolConfig = async () => {
    const { data } = await supabase.from('app_settings').select('*')
    if (data) {
      const config = {}
      data.forEach(d => { config[d.key] = d.value })
      setSchoolConfig(prev => ({
        school_name: config.school_name || prev.school_name,
        address:     config.address     || prev.address,
        phone:       config.phone       || prev.phone,
        email:       config.email       || prev.email,
        logo:        config.logo        || prev.logo,
      }))
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchStudents(), fetchClasses(), fetchPayments()])
    setLoading(false)
  }

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, class_id, classes(name, level)')
      .eq('active', true)
      .order('first_name')
    setStudents(data || [])
  }

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .order('name')
    setClasses(data || [])
  }

  const fetchPayments = async () => {
    const { data, error } = await supabase
      .from('fee_payments')
      .select('*, students(first_name, last_name, class_id, classes(name, level))')
      .order('created_at', { ascending: false })
    if (error) console.error('fetchPayments error:', error)
    setPayments(data || [])
  }

  const formatAmount = n =>
    `GHS ${parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`

  const formatDate = d =>
    d ? new Date(d).toLocaleDateString('en-GB') : '—'

  const statusBadge = (status) => {
    const styles = {
      paid:    'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      partial: 'bg-orange-100 text-orange-700',
    }
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full
                        ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : '—'}
      </span>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODIFIÉ : retourne les montants ANNUELS (sans division par terme)
  // ═══════════════════════════════════════════════════════════════════════
  const getExpectedFeeItems = async (studentId, academicYear, term) => {
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('class_id, classes(name, level)')
      .eq('id', studentId)
      .single()

    if (studentErr || !student?.classes) {
      console.warn('Classe introuvable pour l’élève', studentId)
      return []
    }

    const className = student.classes.name.trim()
    const levelName = className.replace(/\s*[A-Za-z]$/, '').trim()

    const { data: levelData, error: levelErr } = await supabase
      .from('levels')
      .select('id')
      .ilike('name', levelName)
      .maybeSingle()

    if (levelErr || !levelData) {
      console.warn('Niveau introuvable pour', levelName)
      return []
    }

    const levelId = levelData.id

    const { data: fees, error: feesErr } = await supabase
      .from('fee_structure')
      .select('fee_name, fee_type, amount, is_mandatory')
      .eq('level_id', levelId)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('is_mandatory', { ascending: false })

    if (feesErr || !fees || fees.length === 0) {
      console.warn('Aucun frais trouvé pour level_id', levelId, 'et année', academicYear)
      return []
    }

    // retourne le montant annuel complet, sans division
    return fees.map(f => ({
      description: `${f.fee_name} (${f.fee_type})`,
      expected: parseFloat(Number(f.amount).toFixed(2)),
    }))
  }

  const openAddForm = async () => {
  setEditPayment(null)
  setForm({
    student_id:     '',
    amount:         '',
    payment_type:   'Tuition',
    payment_method: 'Cash',
    receipt_number: '',
    status:         'paid',
    academic_year:  '2025/2026',
    term:           'Term 1',
    notes:          '',
  })
  setMessage('')
  setShowForm(true)
}

  const openEditForm = (payment) => {
    setEditPayment(payment)
    setForm({
      student_id:     payment.student_id     || '',
      amount:         payment.amount         || '',
      payment_type:   payment.payment_type   || 'Tuition',
      payment_method: payment.payment_method || 'Cash',
      receipt_number: payment.receipt_number || '',
      status:         payment.status         || 'paid',
      academic_year:  payment.academic_year  || '2024/2025',
      term:           payment.term           || 'Term 1',
      notes:          payment.notes          || '',
    })
    setMessage('')
    setShowForm(true)
  }

  const handlePrintReceipt = async (payment) => {
    const expectedItems = await getExpectedFeeItems(
      payment.student_id,
      payment.academic_year || '2024/2025',
      payment.term || 'Term 1'
    )

    let feeItems = []
    const amountPaid = parseFloat(payment.amount || 0)

    if (expectedItems.length > 0) {
      let remaining = amountPaid
      feeItems = expectedItems.map((item, idx) => {
        let paid = 0
        if (idx === 0) {
          paid = Math.min(remaining, item.expected)
          remaining -= paid
        } else if (remaining > 0) {
          paid = Math.min(remaining, item.expected)
          remaining -= paid
        }
        return { description: item.description, expected: item.expected, paid }
      })
      if (remaining > 0) {
        feeItems.push({ description: 'Overpayment', expected: 0, paid: remaining })
      }
    } else {
      feeItems = [{
        description: `${payment.payment_type} — ${payment.term} (${payment.academic_year})`,
        expected: amountPaid,
        paid: amountPaid,
      }]
    }

    await printReceipt(
      { ...payment, feeItems, collected_by_name: payment.collected_by_name || 'Accountant' },
      schoolConfig
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    if (!form.student_id) {
      setMessage('❌ Please select a student.')
      setSaving(false)
      return
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setMessage('❌ Please enter a valid amount.')
      setSaving(false)
      return
    }

    const receiptNum = editPayment ? form.receipt_number.trim() : await generateReceiptNumber()
console.log('RECEIPT NUMBER GENERATED:', receiptNum)

const payload = {
  student_id:     form.student_id,
  amount:         parseFloat(form.amount),
  payment_type:   form.payment_type,
  payment_method: form.payment_method,
  receipt_number: receiptNum,
  status:         form.status,
  academic_year:  form.academic_year,
  term:           form.term,
  notes:          form.notes.trim() || null,
}

    try {
      if (editPayment) {
        const oldPayment = payments.find(p => p.id === editPayment.id)
        const { data, error } = await supabase
          .from('fee_payments')
          .update(payload)
          .eq('id', editPayment.id)
          .select()
          .single()

        if (error) throw error

        await logAction({
          action:      'UPDATE',
          tableName:   'fee_payments',
          recordId:    data.id,
          oldData:     oldPayment,
          newData:     data,
          description: `Updated fee payment — ${data.payment_type} GHS ${data.amount} `
                     + `(${data.term} · ${data.academic_year}) · Receipt: ${data.receipt_number}`,
        })

        setMessage('✅ Payment updated successfully!')
        await fetchPayments()
        setTimeout(() => setShowForm(false), 1200)

      } else {
        const { data, error } = await supabase
          .from('fee_payments')
          .insert([payload])
          .select()
          .single()

        if (error) throw error

        const student = students.find(s => s.id === data.student_id)
        const studentName = student
          ? `${student.first_name} ${student.last_name}`
          : 'Unknown student'

        await logAction({
          action:      'CREATE',
          tableName:   'fee_payments',
          recordId:    data.id,
          oldData:     null,
          newData:     data,
          description: `Fee payment recorded — ${studentName} · ${data.payment_type} `
                     + `GHS ${data.amount} · ${data.status} · ${data.term} `
                     + `· Receipt: ${data.receipt_number}`,
        })

        const { data: fullPayment } = await supabase
          .from('fee_payments')
          .select('*, students(first_name, last_name, class_id, classes(name, level))')
          .eq('id', data.id)
          .single()

        if (fullPayment) {
          const expectedItems = await getExpectedFeeItems(
            fullPayment.student_id,
            fullPayment.academic_year || '2024/2025',
            fullPayment.term || 'Term 1'
          )

          const amountPaid = parseFloat(fullPayment.amount || 0)
          let feeItems = []
          if (expectedItems.length > 0) {
            let remaining = amountPaid
            feeItems = expectedItems.map((item, idx) => {
              let paid = 0
              if (idx === 0) {
                paid = Math.min(remaining, item.expected)
                remaining -= paid
              } else if (remaining > 0) {
                paid = Math.min(remaining, item.expected)
                remaining -= paid
              }
              return { description: item.description, expected: item.expected, paid }
            })
            if (remaining > 0) {
              feeItems.push({ description: 'Overpayment', expected: 0, paid: remaining })
            }
          } else {
            feeItems = [{
              description: `${fullPayment.payment_type} — ${fullPayment.term || 'Term 1'} (${fullPayment.academic_year || '2024/2025'})`,
              expected: amountPaid,
              paid: amountPaid,
            }]
          }

          const { data: { user } } = await supabase.auth.getUser()
          let collectorName = 'Accountant'
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', user.id)
              .single()
            collectorName = profile?.full_name || 'Accountant'
          }

          await printReceipt(
            { ...fullPayment, feeItems, collected_by_name: collectorName },
            schoolConfig
          )
        }

        setMessage('✅ Payment recorded & receipt printed!')
        await fetchPayments()
        setTimeout(() => setShowForm(false), 1200)
      }

    } catch (err) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payment record?')) return

    const paymentToDelete = payments.find(p => p.id === id)
    const student = students.find(s => s.id === paymentToDelete?.student_id)
    const studentName = student
      ? `${student.first_name} ${student.last_name}`
      : 'Unknown student'

    const { error } = await supabase
      .from('fee_payments')
      .delete()
      .eq('id', id)

    if (!error) {
      await logAction({
        action:      'DELETE',
        tableName:   'fee_payments',
        recordId:    id,
        oldData:     paymentToDelete,
        newData:     null,
        description: `Deleted fee payment — ${studentName} · `
                   + `${paymentToDelete?.payment_type} GHS ${paymentToDelete?.amount} `
                   + `· Receipt: ${paymentToDelete?.receipt_number}`,
      })

      setPayments(prev => prev.filter(p => p.id !== id))
    } else {
      setMessage(`❌ Error: ${error.message}`)
    }
  }

  const filtered = payments.filter(p => {
    const fullName = `${p.students?.first_name} ${p.students?.last_name}`.toLowerCase()
    const matchSearch  = fullName.includes(search.toLowerCase()) ||
                         p.receipt_number?.toLowerCase().includes(search.toLowerCase())
    const matchClass   = filterClass  ? p.students?.class_id === filterClass  : true
    const matchTerm    = filterTerm   ? p.term            === filterTerm       : true
    const matchStatus  = filterStatus ? p.status          === filterStatus     : true
    const matchYear    = filterYear   ? p.academic_year   === filterYear       : true
    return matchSearch && matchClass && matchTerm && matchStatus && matchYear
  })

  const totalCollected = filtered
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

  const totalPending = filtered
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

  const totalPartial = filtered
    .filter(p => p.status === 'partial')
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

  return (
    <div className="p-6 space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Fee Payments</h2>
          <p className="text-gray-500 text-sm">{payments.length} payment records</p>
        </div>
        <button
          onClick={openAddForm}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2
                     rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          ➕ Record Payment
        </button>
      </div>

      {message && !showForm && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-green-500">
          <p className="text-sm text-gray-500 font-medium">Total Collected</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatAmount(totalCollected)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500 font-medium">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{formatAmount(totalPending)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-orange-500">
          <p className="text-sm text-gray-500 font-medium">Partial</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{formatAmount(totalPartial)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3">
        <input type="text" placeholder="🔍 Search student or receipt..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-48 px-4 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterTerm} onChange={e => setFilterTerm(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Terms</option>
          {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Years</option>
          {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => { setSearch(''); setFilterClass(''); setFilterTerm(''); setFilterStatus(''); setFilterYear('') }} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Clear</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500">Loading payments...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-2">💳</p>
            <p className="text-gray-500">No payment records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-4">#</th><th className="px-6 py-4">Receipt</th><th className="px-6 py-4">Student</th><th className="px-6 py-4">Class</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Method</th><th className="px-6 py-4">Term</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Date</th><th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((payment, index) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-400 text-sm">{index + 1}</td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-600">{payment.receipt_number}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{payment.students?.first_name} {payment.students?.last_name}</td>
                    <td className="px-6 py-4 text-gray-600">{payment.students?.classes?.name || '—'}</td>
                    <td className="px-6 py-4 text-gray-600">{payment.payment_type}</td>
                    <td className="px-6 py-4 text-gray-600">{payment.payment_method}</td>
                    <td className="px-6 py-4 text-gray-600">{payment.term || '—'}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{formatAmount(payment.amount)}</td>
                    <td className="px-6 py-4">{statusBadge(payment.status)}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{formatDate(payment.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEditForm(payment)} className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50">✏️ Edit</button>
                        <button onClick={() => handlePrintReceipt(payment)} className="text-green-600 hover:text-green-800 text-sm font-medium px-2 py-1 rounded hover:bg-green-50">🖨️ Print</button>
                        <button onClick={() => handleDelete(payment.id)} className="text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1 rounded hover:bg-red-50">🗑️ Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{editPayment ? '✏️ Edit Payment' : '➕ Record Payment'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {message && (
                <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student <span className="text-red-500">*</span></label>
                <select required value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Select a student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} — {s.classes?.name || 'No class'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS) <span className="text-red-500">*</span></label>
                <input type="number" required min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0.00" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
                  <select value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                  <select value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                  <select value={form.academic_year} onChange={e => setForm(f => ({ ...f, academic_year: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Number</label>
                <input type="text" value={form.receipt_number} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 text-gray-500 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" placeholder="Any additional notes..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50">
                  {saving ? '⏳ Saving...' : editPayment ? '✅ Update' : '✅ Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}