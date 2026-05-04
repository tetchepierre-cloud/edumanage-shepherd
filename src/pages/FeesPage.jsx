// src/pages/FeesPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import { printReceipt, generateReceiptNumber } from '../lib/receiptGenerator'
import { generateFeesReport } from '../lib/feesReportGenerator'
import { generateStudentStatement } from '../lib/statementGenerator'
import { generateDiscountReport } from '../lib/discountReportGenerator'

const PAYMENT_TYPES  = ['Tuition', 'Uniform', 'Books', 'Exam', 'Other']
const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque']
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
  const [filterStatus, setFilterStatus] = useState('')
  const [filterYear,   setFilterYear]   = useState('')
  const [studentSearch, setStudentSearch] = useState('')

  // ── Lignes de frais dynamiques ─────────────────────────────────────────
  const [feeLines, setFeeLines] = useState([{ type: 'Tuition', amount: '', max: 0, locked: false, feeStructureId: null }])

  const addFeeLine = () => setFeeLines(prev => [...prev, { type: 'Tuition', amount: '', max: 0, locked: false, feeStructureId: null }])
  const removeFeeLine = (idx) => setFeeLines(prev => prev.filter((_, i) => i !== idx))
  const updateFeeLine = (idx, field, value) => {
    setFeeLines(prev => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line))
  }

  const [form, setForm] = useState({
    student_id:     '',
    amount:         '',
    payment_type:   'Tuition',
    payment_method: 'Cash',
    receipt_number: '',
    status:         'paid',
    academic_year:  '2024/2025',
    payment_date:   new Date().toISOString().split('T')[0],
    notes:          '',
  })

  const [schoolConfig, setSchoolConfig] = useState({
    school_name: 'BRIGHT FUTURE SCHOOL',
    address:     'Tamale, Northern Region',
    phone:       '+233 20 000 0000',
    email:       '',
    logo:        null,
  })

  // ── États pour le modal du rapport des frais ──────────────────────────
  const [showReportModal, setShowReportModal] = useState(false)
  const [showOnlyActive, setShowOnlyActive] = useState(true)
  const [reportParams, setReportParams] = useState({
    academicYear: '2025/2026',
    periodType: '1',
    monthInput: '04/2026',
    customFrom: '',
    customTo: '',
    tableType: '1',
  })

  // ── États pour le modal du relevé de compte ──────────────────────────
  const [showStatementModal, setShowStatementModal] = useState(false)
  const [statementSearch, setStatementSearch] = useState('')
  const [statementStudent, setStatementStudent] = useState(null)
  const [statementParams, setStatementParams] = useState({
    academicYear: '2025/2026',
    periodType: '1',
    customFrom: '',
    customTo: '',
  })

  // ── États pour le modal du rapport des réductions ────────────────────
  const [showDiscountReportModal, setShowDiscountReportModal] = useState(false)
  const [discountReportYear, setDiscountReportYear] = useState('2025/2026')

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

  // ── Recherche d'élèves sans filtre d'activité ─────────────────────────
  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, class_id, classes(name, level)')
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
  // Retourne les montants ANNUELS avec le type original (après réductions)
  // ═══════════════════════════════════════════════════════════════════════
  const getExpectedFeeItems = async (studentId, academicYear) => {
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
      .select('id, fee_name, fee_type, amount, is_mandatory, required_for_admission')
      .eq('level_id', levelId)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('is_mandatory', { ascending: false })

    if (feesErr || !fees || fees.length === 0) {
      console.warn('Aucun frais trouvé pour level_id', levelId, 'et année', academicYear)
      return []
    }

    const { data: discounts } = await supabase
      .from('student_fee_discounts')
      .select('fee_structure_id, discount_type, discount_value')
      .eq('student_id', studentId)

    const discountMap = {}
    ;(discounts || []).forEach(d => {
      discountMap[d.fee_structure_id] = d
    })

    return fees.map(f => {
      let originalAmount = parseFloat(f.amount)
      let finalAmount = originalAmount
      const discount = discountMap[f.id]
      if (discount) {
        if (discount.discount_type === 'fixed') {
          finalAmount = Math.max(0, originalAmount - parseFloat(discount.discount_value))
        } else {
          finalAmount = originalAmount * (1 - parseFloat(discount.discount_value) / 100)
        }
      }
      return {
        description: `${f.fee_name} (${f.fee_type})`,
        expected: parseFloat(finalAmount.toFixed(2)),
        type: f.fee_name,      // <-- libellé complet "School Fees"
        feeStructureId: f.id,
        requiredForAdmission: f.required_for_admission,
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Calcule le restant dû par type pour un élève (avec réductions)
  // ═══════════════════════════════════════════════════════════════════════
  const getRemainingFeesForStudent = async (studentId, academicYear) => {
    const feeStructure = await getExpectedFeeItems(studentId, academicYear)
    if (!feeStructure.length) return []

    const { data: payments } = await supabase
      .from('fee_payments')
      .select('amount, payment_type, fee_items, status')
      .eq('student_id', studentId)
      .eq('academic_year', academicYear)
      .in('status', ['paid', 'partial'])

    const paidByType = {}
    ;(payments || []).forEach(p => {
      if (p.fee_items && Array.isArray(p.fee_items) && p.fee_items.length > 0) {
        p.fee_items.forEach(fi => {
          const key = (fi.type || '').toLowerCase()
          paidByType[key] = (paidByType[key] || 0) + parseFloat(fi.amount || 0)
        })
      } else {
        const key = (p.payment_type || '').toLowerCase()
        paidByType[key] = (paidByType[key] || 0) + parseFloat(p.amount || 0)
      }
    })

    return feeStructure.map(f => {
      const annual = f.expected
      const alreadyPaid = paidByType[f.type.toLowerCase()] || 0
      const remaining = Math.max(0, annual - alreadyPaid)
      return {
        type: f.type,   // déjà le nom complet
        label: f.description.split(' (')[0],
        annual,
        alreadyPaid,
        remaining,
        feeStructureId: f.feeStructureId,
        requiredForAdmission: f.requiredForAdmission,
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mise à jour automatique du statut actif (corrigée)
  // ═══════════════════════════════════════════════════════════════════════
  const updateStudentActiveStatus = async (studentId, academicYear) => {
    const { data: student } = await supabase
      .from('students')
      .select('min_payment_override, class_id, classes(name)')
      .eq('id', studentId)
      .single()

    if (!student?.classes?.name) return

    const className = student.classes.name.trim()
    const levelName = className.replace(/\s*[A-Za-z]$/, '').trim()

    const { data: level } = await supabase
      .from('levels')
      .select('id, min_payment')
      .ilike('name', levelName)
      .maybeSingle()

    const minPayment = student.min_payment_override ?? level?.min_payment ?? 0

    const { data: fees } = await supabase
      .from('fee_structure')
      .select('id, amount, fee_name, fee_type')
      .eq('level_id', level?.id)
      .eq('academic_year', academicYear)
      .eq('required_for_admission', true)

    if (!fees?.length) {
      await supabase.from('students').update({ active: true }).eq('id', studentId)
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, active: true } : s))
      return
    }

    const { data: discounts } = await supabase
      .from('student_fee_discounts')
      .select('fee_structure_id, discount_type, discount_value')
      .eq('student_id', studentId)

    const discountMap = {}
    ;(discounts || []).forEach(d => { discountMap[d.fee_structure_id] = d })

    let totalRequiredAmount = 0
    fees.forEach(f => {
      let amount = parseFloat(f.amount)
      const d = discountMap[f.id]
      if (d) {
        if (d.discount_type === 'fixed') amount = Math.max(0, amount - parseFloat(d.discount_value))
        else amount *= (1 - parseFloat(d.discount_value) / 100)
      }
      totalRequiredAmount += amount
    })

    const { data: payments } = await supabase
      .from('fee_payments')
      .select('amount, fee_items, payment_type')
      .eq('student_id', studentId)
      .eq('academic_year', academicYear)
      .in('status', ['paid', 'partial'])

    let totalPaidRequired = 0
    ;(payments || []).forEach(p => {
      if (p.fee_items && Array.isArray(p.fee_items) && p.fee_items.length > 0) {
        p.fee_items.forEach(fi => {
          const fee = fees.find(f => f.fee_name === fi.type)
          if (fee) {
            totalPaidRequired += parseFloat(fi.amount || 0)
          }
        })
      } else {
        const fee = fees.find(f => f.fee_name === p.payment_type) ||
                    fees.find(f => f.fee_type === p.payment_type)
        if (fee) {
          totalPaidRequired += parseFloat(p.amount || 0)
        }
      }
    })

    const newActive = totalPaidRequired >= minPayment
    await supabase.from('students').update({ active: newActive }).eq('id', studentId)
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, active: newActive } : s))
  }

  // ── Ouvertures de modaux ──────────────────────────────────────────────
  const openAddForm = async () => {
    await fetchStudents()
    setEditPayment(null)
    setForm({
      student_id:     '',
      amount:         '',
      payment_type:   'Tuition',
      payment_method: 'Cash',
      receipt_number: '',
      status:         'paid',
      academic_year:  '2025/2026',
      payment_date:   new Date().toISOString().split('T')[0],
      notes:          '',
    })
    setFeeLines([{ type: 'Tuition', amount: '', max: 0, locked: false, feeStructureId: null }])
    setStudentSearch('')
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
      payment_date:   payment.payment_date   || new Date().toISOString().split('T')[0],
      notes:          payment.notes          || '',
    })
    if (payment.fee_items && payment.fee_items.length > 0) {
      setFeeLines(payment.fee_items.map(item => ({
        type: item.type,
        amount: item.amount.toString(),
        max: 0,
        locked: false,
        feeStructureId: null,
      })))
    } else {
      setFeeLines([{ type: payment.payment_type, amount: payment.amount.toString(), max: 0, locked: false, feeStructureId: null }])
    }
    setMessage('')
    setShowForm(true)
  }

  const handlePrintReceipt = async (payment) => {
    const expectedItems = await getExpectedFeeItems(
      payment.student_id,
      payment.academic_year || '2024/2025',
    )

    let feeItems = []
    const amountPaid = parseFloat(payment.amount || 0)

    if (payment.fee_items && Array.isArray(payment.fee_items) && payment.fee_items.length > 0) {
      feeItems = payment.fee_items.map(fi => ({
        description: fi.type,
        expected: parseFloat(fi.amount || 0),
        paid: parseFloat(fi.amount || 0),
      }))
    } else if (expectedItems.length > 0) {
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
        description: `${payment.payment_type} (${payment.academic_year})`,
        expected: amountPaid,
        paid: amountPaid,
      }]
    }

    await printReceipt(
      { ...payment, feeItems, collected_by_name: payment.collected_by_name || 'Accountant' },
      schoolConfig
    )
  }

  const handleGenerateReport = () => setShowReportModal(true)
  const handleOpenStatementModal = () => {
    setStatementSearch('')
    setStatementStudent(null)
    setStatementParams({
      academicYear: '2025/2026',
      periodType: '1',
      customFrom: '',
      customTo: '',
    })
    setShowStatementModal(true)
  }
  const handleOpenDiscountReport = () => setShowDiscountReportModal(true)

  // ═══════════════════════════════════════════════════════════════════════
  // Enregistrement d'un paiement
  // ═══════════════════════════════════════════════════════════════════════
  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    if (!form.student_id) {
      setMessage('❌ Please select a student.')
      setSaving(false)
      return
    }

    const remainingFees = await getRemainingFeesForStudent(form.student_id, form.academic_year)

    const validLines = feeLines.filter(l => parseFloat(l.amount) > 0)
    if (validLines.length === 0) {
      setMessage('❌ Add at least one fee item with amount > 0.')
      setSaving(false)
      return
    }

    for (const line of validLines) {
      const remaining = remainingFees.find(r => r.type.toLowerCase() === line.type.toLowerCase())
      if (remaining && parseFloat(line.amount) > remaining.remaining) {
        setMessage(`❌ Amount for ${line.type} exceeds remaining balance (${formatAmount(remaining.remaining)}).`)
        setSaving(false)
        return
      }
    }

    const totalAmount = validLines.reduce((sum, l) => sum + parseFloat(l.amount), 0)

    const receiptNum = editPayment ? form.receipt_number.trim() : await generateReceiptNumber()

    const payload = {
      student_id:     form.student_id,
      amount:         totalAmount,
      payment_type:   validLines.length > 1 ? 'Multiple' : validLines[0].type,
      payment_method: form.payment_method,
      receipt_number: receiptNum,
      status:         'partial',
      academic_year:  form.academic_year,
      payment_date:   form.payment_date,
      notes:          form.notes.trim() || null,
      fee_items:      validLines.map(l => ({ type: l.type, amount: parseFloat(l.amount) })),
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
                     + `(${data.academic_year}) · Receipt: ${data.receipt_number}`,
        })

        await updateStudentActiveStatus(form.student_id, form.academic_year)

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
                     + `GHS ${data.amount} · ${data.status} · ${data.academic_year} `
                     + `· Receipt: ${data.receipt_number}`,
        })

        await updateStudentActiveStatus(form.student_id, form.academic_year)

        const { data: fullPayment } = await supabase
          .from('fee_payments')
          .select('*, students(first_name, last_name, class_id, classes(name, level))')
          .eq('id', data.id)
          .single()

        if (fullPayment) {
          const feeItems = validLines.map(l => ({
            description: l.type,
            expected: parseFloat(l.amount),
            paid: parseFloat(l.amount),
          }))

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
    const matchStatus  = filterStatus ? p.status          === filterStatus     : true
    const matchYear    = filterYear   ? p.academic_year   === filterYear       : true
    return matchSearch && matchClass && matchStatus && matchYear
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
        <div className="flex items-center gap-2">
          <button onClick={openAddForm} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">➕ Record Payment</button>
          <button onClick={handleGenerateReport} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2" title="Fees Collection Report">📊 Fees Report</button>
          <button onClick={handleOpenStatementModal} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2" title="Student Statement">📄 Statement</button>
          <button onClick={handleOpenDiscountReport} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2" title="Discount Report">🏷️ Discounts</button>
        </div>
      </div>

      {message && !showForm && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-green-500">
          <p className="text-sm text-gray-500 font-medium">Fully Paid</p>
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
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All Years</option>
          {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => { setSearch(''); setFilterClass(''); setFilterStatus(''); setFilterYear('') }} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Clear</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-auto max-h-[65vh]">
        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" /><p className="text-gray-500">Loading payments...</p></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12"><p className="text-4xl mb-2">💳</p><p className="text-gray-500">No payment records found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-4">#</th>
                  <th className="px-6 py-4">Receipt</th>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Class</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Method</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((payment, index) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-400 text-sm">{index + 1}</td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-600">{payment.receipt_number}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{payment.students?.first_name} {payment.students?.last_name}</td>
                    <td className="px-6 py-4 text-gray-600">{payment.students?.classes?.name || '—'}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {payment.payment_type === 'Multiple' && payment.fee_items?.length
                        ? payment.fee_items.map((fi, idx) => (<div key={idx}>{fi.type}</div>))
                        : payment.payment_type}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{payment.payment_method}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{formatAmount(payment.amount)}</td>
                    <td className="px-6 py-4">{statusBadge(payment.status)}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">
                      {payment.payment_date ? formatDate(payment.payment_date) : formatDate(payment.created_at)}
                    </td>
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

      {/* ── Modal du formulaire de paiement ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{editPayment ? '✏️ Edit Payment' : '➕ Record Payment'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {message && (<div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>)}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Student <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Type name to search..." value={studentSearch} onChange={e => { setStudentSearch(e.target.value); setForm(f => ({ ...f, student_id: '' })) }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" autoComplete="off" />
                {studentSearch.length > 0 && form.student_id === '' && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto top-full">
                    {students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(studentSearch.toLowerCase())).slice(0, 10).map(s => (
                      <div key={s.id} onClick={async () => { setForm(f => ({ ...f, student_id: s.id })); setStudentSearch(`${s.first_name} ${s.last_name} — ${s.classes?.name || ''}`); const remaining = await getRemainingFeesForStudent(s.id, form.academic_year); if (remaining && remaining.length > 0) { setFeeLines(remaining.map(r => ({ type: r.type, amount: '', max: r.remaining, label: r.label, remaining: r.remaining, locked: true, feeStructureId: r.feeStructureId }))) } else { setFeeLines([{ type: 'Tuition', amount: '', max: 0, locked: false, feeStructureId: null }]) } }} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0">
                        <span className="font-medium">{s.first_name} {s.last_name}</span><span className="text-gray-400 ml-2 text-xs">{s.classes?.name || 'No class'}</span>
                      </div>
                    ))}
                    {students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(studentSearch.toLowerCase())).length === 0 && (<div className="px-3 py-2 text-sm text-gray-400">No student found</div>)}
                  </div>
                )}
                {form.student_id && (<div className="mt-1 text-xs text-green-600 font-medium">✓ Student selected</div>)}
              </div>

              {/* ── Lignes de frais dynamiques ── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fee Items</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {feeLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select value={line.type} onChange={e => updateFeeLine(idx, 'type', e.target.value)} disabled={line.locked} className={`flex-1 px-2 py-1 border rounded text-sm ${line.locked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}>
                        {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        {!PAYMENT_TYPES.includes(line.type) && (<option value={line.type}>{line.type}</option>)}
                      </select>
                      <input type="number" placeholder="0.00" value={line.amount} onChange={e => { const val = parseFloat(e.target.value) || 0; if (val > line.max) return; updateFeeLine(idx, 'amount', e.target.value) }} className="w-28 px-2 py-1 border border-gray-300 rounded text-sm" min="0" step="0.01" />
                      {line.max > 0 && (<span className="text-xs text-gray-400">max {formatAmount(line.max)}</span>)}
                      {!line.locked && feeLines.length > 1 && (<button type="button" onClick={() => removeFeeLine(idx)} className="text-red-500 hover:text-red-700 text-lg">×</button>)}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right"><span className="text-sm font-bold text-gray-700">Total remaining: {formatAmount(feeLines.reduce((sum, l) => sum + (l.max || 0), 0))}</span></div>
                <button type="button" onClick={addFeeLine} className="mt-1 text-blue-600 hover:text-blue-800 text-sm">+ Add fee line</button>
              </div>

              {/* Affichage du total */}
              <div className="bg-gray-50 rounded-lg p-3 text-right">
                <span className="text-sm font-semibold text-gray-700">Total: </span>
                <span className="text-lg font-bold text-blue-600">{formatAmount(feeLines.reduce((sum, l) => sum + parseFloat(l.amount || 0), 0))}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                  <select value={form.academic_year} onChange={e => setForm(f => ({ ...f, academic_year: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                  <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Number</label>
                  <input type="text" value={form.receipt_number} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 text-gray-500 cursor-not-allowed" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" placeholder="Any additional notes..." />
              </div>

              {/* Statut en lecture seule uniquement en édition */}
              {editPayment && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <input type="text" value={form.status.charAt(0).toUpperCase() + form.status.slice(1)} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
                </div>
              )}

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

      {/* ── Modal du rapport des frais ── */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">📊 Generate Fees Report</h3>
              <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <select value={reportParams.academicYear} onChange={e => setReportParams({ ...reportParams, academicYear: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period Type</label>
                <select value={reportParams.periodType} onChange={e => setReportParams({ ...reportParams, periodType: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="1">Academic Year (1 Sep – 30 Jun)</option>
                  <option value="2">Month</option>
                  <option value="3">Custom</option>
                </select>
              </div>
              {reportParams.periodType === '2' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month (MM/YYYY)</label>
                  <input type="text" placeholder="MM/YYYY" value={reportParams.monthInput} onChange={e => setReportParams({ ...reportParams, monthInput: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              )}
              {reportParams.periodType === '3' && (
                <>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Date from</label><input type="date" value={reportParams.customFrom} onChange={e => setReportParams({ ...reportParams, customFrom: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Date to</label><input type="date" value={reportParams.customTo} onChange={e => setReportParams({ ...reportParams, customTo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Table Type</label>
                <select value={reportParams.tableType} onChange={e => setReportParams({ ...reportParams, tableType: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="1">By class</option>
                  <option value="2">By student</option>
                </select>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="showOnlyActive" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} className="h-4 w-4 text-blue-600 rounded" />
                <label htmlFor="showOnlyActive" className="text-sm text-gray-700">Show only students with payment in period</label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowReportModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
                <button type="button" onClick={async () => {
                  let dateFrom, dateTo
                  const y = parseInt(reportParams.academicYear.split('/')[0])
                  if (reportParams.periodType === '1') {
                    dateFrom = new Date(y, 8, 1)
                    dateTo   = new Date(y + 1, 5, 30)
                  } else if (reportParams.periodType === '2') {
                    const [m, yyyy] = reportParams.monthInput.split('/').map(Number)
                    dateFrom = new Date(yyyy, m - 1, 1)
                    dateTo   = new Date(yyyy, m, 0, 23, 59, 59)
                  } else {
                    dateFrom = new Date(reportParams.customFrom)
                    dateTo   = new Date(reportParams.customTo)
                  }
                  setShowReportModal(false)
                  await generateFeesReport({
                    academicYear: reportParams.academicYear,
                    dateFrom,
                    dateTo,
                    tableType: reportParams.tableType === '2' ? 'student' : 'class',
                    schoolConfig,
                    showOnlyActive,
                  })
                }} className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm">Generate Report</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal du relevé de compte ── */}
      {showStatementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">📄 Student Statement</h3>
              <button onClick={() => setShowStatementModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {!statementStudent ? (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Search Student</label>
                  <input type="text" placeholder="Type student name..." value={statementSearch} onChange={e => setStatementSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" autoComplete="off" />
                  {statementSearch.length > 0 && (
                    <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto bottom-full mb-1">
                      {students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(statementSearch.toLowerCase())).slice(0, 10).map(s => (
                        <div key={s.id} onClick={() => { setStatementStudent({ id: s.id, first_name: s.first_name, last_name: s.last_name, class_id: s.class_id, classes: s.classes }); setStatementSearch(`${s.first_name} ${s.last_name} — ${s.classes?.name || ''}`) }} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0">
                          <span className="font-medium">{s.first_name} {s.last_name}</span><span className="text-gray-400 ml-2 text-xs">{s.classes?.name || 'No class'}</span>
                        </div>
                      ))}
                      {students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(statementSearch.toLowerCase())).length === 0 && (<div className="px-3 py-2 text-sm text-gray-400">No student found</div>)}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{statementStudent.first_name} {statementStudent.last_name}</p>
                      <p className="text-xs text-gray-500">{statementStudent.classes?.name || 'No class'}</p>
                    </div>
                    <button onClick={() => { setStatementStudent(null); setStatementSearch('') }} className="text-xs text-blue-600 hover:underline">Change</button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <select value={statementParams.academicYear} onChange={e => setStatementParams({ ...statementParams, academicYear: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="2024/2025">2024/2025</option><option value="2025/2026">2025/2026</option><option value="2026/2027">2026/2027</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Period Type</label>
                    <select value={statementParams.periodType} onChange={e => setStatementParams({ ...statementParams, periodType: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="1">Full Academic Year</option><option value="2">Term</option><option value="3">Custom</option>
                    </select>
                  </div>
                  {statementParams.periodType === '2' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                      <select value={statementParams.term || 'T1'} onChange={e => setStatementParams({ ...statementParams, term: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="T1">Term 1</option><option value="T2">Term 2</option><option value="T3">Term 3</option>
                      </select>
                    </div>
                  )}
                  {statementParams.periodType === '3' && (
                    <>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Date from</label><input type="date" value={statementParams.customFrom} onChange={e => setStatementParams({ ...statementParams, customFrom: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Date to</label><input type="date" value={statementParams.customTo} onChange={e => setStatementParams({ ...statementParams, customTo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                    </>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowStatementModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
                    <button type="button" onClick={async () => {
                      let period = 'full', customFrom = null, customTo = null
                      if (statementParams.periodType === '2') period = statementParams.term || 'T1'
                      else if (statementParams.periodType === '3') { period = 'custom'; customFrom = statementParams.customFrom; customTo = statementParams.customTo }
                      setShowStatementModal(false)
                      await generateStudentStatement({ student: statementStudent, academicYear: statementParams.academicYear, period, customFrom, customTo, schoolConfig })
                    }} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm">Generate Statement</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal du rapport des réductions ── */}
      {showDiscountReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">🏷️ Discount Report</h3>
              <button onClick={() => setShowDiscountReportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <select
                  value={discountReportYear}
                  onChange={e => setDiscountReportYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="2024/2025">2024/2025</option>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2026/2027">2026/2027</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDiscountReportModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
                <button type="button" onClick={async () => {
                  setShowDiscountReportModal(false)
                  await generateDiscountReport({
                    academicYear: discountReportYear,
                    schoolConfig,
                  })
                }} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm">Generate</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}