// src/lib/receiptGenerator.js
// Génère un reçu de paiement PDF A5 directement dans le navigateur
// Format N° reçu : PAYAAAANNNNmmm ex: PAY20260001JAN
// Prend en compte les réductions individuelles (student_fee_discounts)
// et corrige la correspondance entre les paiements et les colonnes du résumé.

import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

// ── Mise en page A5 ───────────────────────────────────────────────────────────
const A5_W = 148
const A5_H = 210
const M    = 10
const CW   = A5_W - M * 2

// ── Couleurs ──────────────────────────────────────────────────────────────────
const BLUE   = [30, 77, 145]
const BLUE_L = [214, 228, 247]
const LGRAY  = [245, 247, 250]
const MGRAY  = [226, 232, 240]
const DGRAY  = [107, 114, 128]
const BLACK  = [17, 24, 39]
const GREEN  = [22, 101, 52]
const GBG    = [220, 252, 231]
const AMBER  = [146, 64, 14]
const ABGC   = [254, 243, 199]
const WHITE  = [255, 255, 255]
const GOLD   = [255, 215, 0]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fillRect(doc, x, y, w, h, color) {
  doc.setFillColor(...color)
  doc.rect(x, y, w, h, 'F')
}

function strokeRect(doc, x, y, w, h, color, lw = 0.2) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.rect(x, y, w, h, 'S')
}

function text(doc, str, x, y, opts = {}) {
  doc.setTextColor(...(opts.color || BLACK))
  doc.setFontSize(opts.size || 9)
  doc.setFont('helvetica', opts.style || 'normal')
  doc.text(String(str ?? ''), x, y, { align: opts.align || 'left', maxWidth: opts.maxWidth })
}

function hline(doc, y, color = MGRAY, lw = 0.2) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.line(M, y, A5_W - M, y)
}

function fmtGHS(n) {
  return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' — ' + dt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
}

// ── Générer N° reçu ───────────────────────────────────────────────────────────
export async function generateReceiptNumber() {
  const { data, error } = await supabase.rpc('next_receipt_number')
  if (error) throw error
  return data
}

// ── Récupération de la structure annuelle des frais (avec ID) ────────────────
async function getAnnualFeeStructure(student, academicYear) {
  const className = (student.classes?.name || '').trim()
  if (!className) return []

  const levelName = className.replace(/\s*[A-Za-z]$/, '').trim()

  const { data: level } = await supabase
    .from('levels')
    .select('id')
    .ilike('name', levelName)
    .maybeSingle()

  if (!level) return []

  const { data: fees } = await supabase
    .from('fee_structure')
    .select('id, fee_name, fee_type, amount')
    .eq('level_id', level.id)
    .eq('academic_year', academicYear)
    .eq('is_active', true)

  if (!fees?.length) return []

  return fees.map(f => ({
    id: f.id,                        // ← pour lier avec les réductions
    label: f.fee_name,
    type: f.fee_type,
    annual: parseFloat(f.amount),
  }))
}

// ── Historique paiements élève ───────────────────────────────────────────────
async function getStudentPaymentHistory(studentId, academicYear) {
  const { data, error } = await supabase
    .from('fee_payments')
    .select('amount, payment_type, status, fee_items, payment_date')
    .eq('student_id', studentId)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial'])

  if (error) {
    console.error('Error fetching payment history:', error)
  }
  return data || []
}

// ════════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════
export async function printReceipt(payment, schoolConfig = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })

  const school = {
    name:    (schoolConfig.school_name || 'BRIGHT FUTURE SCHOOL').toUpperCase(),
    address: schoolConfig.address || 'Tamale, Northern Region',
    phone:   schoolConfig.phone   || '+233 20 000 0000',
    email:   schoolConfig.email   || '',
  }

  const student         = payment.students || {}
  const className       = student.classes?.name || '—'
  const studentName     = `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—'
  const receiptNo       = payment.receipt_number
  const payDate         = payment.payment_date ? fmtDate(payment.payment_date) : fmtDate(payment.created_at)
  const year            = payment.academic_year  || '—'
  const method          = payment.payment_method || 'Cash'
  const status          = payment.status         || 'paid'
  const notes           = payment.notes          || ''
  const amountPaidToday = parseFloat(payment.amount || 0)
  const paymentType     = payment.payment_type   || 'Tuition'

  // ── Lignes de frais du jour ──────────────────────────────────────────────
  const feeItems = Array.isArray(payment.feeItems) && payment.feeItems.length > 0
    ? payment.feeItems.map(item => ({
        description: item.description || item.type || 'Tuition',
        expected:    parseFloat(item.expected || item.amount || 0),
        paid:        parseFloat(item.paid || item.amount || 0),
      }))
    : [{
        description: paymentType + ' (' + year + ')',
        expected:    amountPaidToday,
        paid:        amountPaidToday,
      }]

  // ── Récupérer la structure annuelle et les réductions ────────────────────
  const annualStructure = await getAnnualFeeStructure(student, year)

  // Récupérer les réductions de l'élève
  const { data: discounts } = await supabase
    .from('student_fee_discounts')
    .select('fee_structure_id, discount_type, discount_value')
    .eq('student_id', payment.student_id)

  const discountMap = {}
  ;(discounts || []).forEach(d => { discountMap[d.fee_structure_id] = d })

  // Appliquer les réductions sur la structure annuelle
  const adjustedStructure = annualStructure.map(f => {
    let amount = f.annual
    const disc = discountMap[f.id]
    if (disc) {
      if (disc.discount_type === 'fixed') {
        amount = Math.max(0, amount - parseFloat(disc.discount_value))
      } else {
        amount = amount * (1 - parseFloat(disc.discount_value) / 100)
      }
    }
    return { ...f, annual: parseFloat(amount.toFixed(2)) }
  })

  const feeTypes = adjustedStructure.length > 0 ? adjustedStructure : [
    { label: 'Tuition', type: 'tuition', annual: 0 }
  ]

  // ── Historique complet des paiements ─────────────────────────────────────
  const history = await getStudentPaymentHistory(payment.student_id, year)

  // Totaux payés par type ET par label
  const paidByType = {}
  const paidByLabel = {}
  history.forEach(p => {
    if (p.fee_items && Array.isArray(p.fee_items) && p.fee_items.length > 0) {
      p.fee_items.forEach(fi => {
        const typeKey = (fi.type || '').toLowerCase()
        const labelKey = (fi.type || '').toLowerCase()   // dans fee_items, "type" est en réalité le nom complet (label)
        paidByType[typeKey] = (paidByType[typeKey] || 0) + parseFloat(fi.amount || 0)
        paidByLabel[labelKey] = (paidByLabel[labelKey] || 0) + parseFloat(fi.amount || 0)
      })
    } else {
      const key = (p.payment_type || '').toLowerCase()
      paidByType[key] = (paidByType[key] || 0) + parseFloat(p.amount || 0)
      paidByLabel[key] = (paidByLabel[key] || 0) + parseFloat(p.amount || 0)
    }
  })

  const totalAnnualDue = feeTypes.reduce((s, ft) => s + ft.annual, 0)
  const totalPaidAll   = history.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const totalBalance   = Math.max(0, totalAnnualDue - totalPaidAll)

  let y = 0

  // ════════════════════════════════════════════════════════════════════════
  // 1. HEADER BLEU
  // ════════════════════════════════════════════════════════════════════════
  fillRect(doc, 0, 0, A5_W, 30, BLUE)
  doc.setFillColor(...WHITE)
  doc.circle(M + 7, 15, 6, 'F')
  text(doc, '🏫', M + 3.5, 17, { size: 9, color: BLUE })
  text(doc, school.name, M + 18, 10, { size: 10, style: 'bold', color: WHITE })
  text(doc, school.address + (school.phone ? '  |  Tel: ' + school.phone : ''), M + 18, 16, { size: 7, color: [180, 210, 245] })
  if (school.email) text(doc, school.email, M + 18, 22, { size: 6.5, color: [180, 210, 245] })
  text(doc, 'OFFICIAL PAYMENT RECEIPT', A5_W - M, 26, { size: 7.5, style: 'bold', color: GOLD, align: 'right' })
  y = 34

  // ════════════════════════════════════════════════════════════════════════
  // 2. BANDE N° REÇU
  // ════════════════════════════════════════════════════════════════════════
  fillRect(doc, 0, y, A5_W, 8, BLUE_L)
  text(doc, 'Receipt No.:', M, y + 5.5, { size: 7.5, style: 'bold', color: BLUE })
  text(doc, receiptNo, M + 21, y + 5.5, { size: 8.5, style: 'bold', color: BLUE })
  text(doc, 'Date: ' + payDate, A5_W - M, y + 5.5, { size: 7, color: BLACK, align: 'right' })
  y += 11

  // ════════════════════════════════════════════════════════════════════════
  // 3. INFOS ÉLÈVE
  // ════════════════════════════════════════════════════════════════════════
  fillRect(doc, M, y, CW, 24, LGRAY)
  strokeRect(doc, M, y, CW, 24, [200, 210, 225])
  const col2 = M + CW / 2 + 2
  const infoRows = [
    ['Student',    studentName,  'Academic Year', year],
    ['Student ID', payment.student_id?.slice(0,8)?.toUpperCase() || '—', 'Method',        method],
    ['Class',      className,    '',             ''],
  ]
  let iy = y + 6
  infoRows.forEach(([l1, v1, l2, v2]) => {
    text(doc, l1 + ':', M + 2, iy, { size: 7, style: 'bold', color: DGRAY })
    text(doc, v1, M + 19, iy, { size: 7.5, color: BLACK })
    if (l2) {
      text(doc, l2 + ':', col2, iy, { size: 7, style: 'bold', color: DGRAY })
      text(doc, v2, col2 + 19, iy, { size: 7.5, color: BLACK })
    }
    iy += 7
  })
  y += 27

  // ════════════════════════════════════════════════════════════════════════
  // 4. CE PAIEMENT AUJOURD'HUI
  // ════════════════════════════════════════════════════════════════════════
  text(doc, 'THIS PAYMENT', M, y + 4, { size: 7.5, style: 'bold', color: BLUE })
  y += 6

  fillRect(doc, M, y, CW, 6.5, BLUE)
  text(doc, 'Description', M + 2, y + 4.5, { size: 8, style: 'bold', color: WHITE })
  text(doc, 'Amount Paid', A5_W - M - 2, y + 4.5, { size: 8, style: 'bold', color: WHITE, align: 'right' })
  y += 6.5

  let paidY = y
  feeItems.forEach((item, idx) => {
    const bgColor = idx % 2 === 0 ? WHITE : [250, 250, 252]
    fillRect(doc, M, paidY, CW, 7, bgColor)
    strokeRect(doc, M, paidY, CW, 7, MGRAY)
    text(doc, item.description, M + 2, paidY + 5, { size: 8, color: BLACK })
    text(doc, fmtGHS(item.paid), A5_W - M - 2, paidY + 5, { size: 8, style: 'bold', color: BLACK, align: 'right' })
    paidY += 7
  })

  fillRect(doc, M, paidY, CW, 9, GBG)
  strokeRect(doc, M, paidY, CW, 9, GREEN, 0.4)
  text(doc, 'TOTAL', M + 2, paidY + 6, { size: 9, style: 'bold', color: GREEN })
  text(doc, fmtGHS(amountPaidToday), A5_W - M - 2, paidY + 6, { size: 10, style: 'bold', color: GREEN, align: 'right' })
  paidY += 14
  y = paidY

  // ════════════════════════════════════════════════════════════════════════
  // 5. RÉCAPITULATIF DU COMPTE PAR PRESTATION (avec réductions)
  // ════════════════════════════════════════════════════════════════════════
  if (feeTypes.length > 0) {
    hline(doc, y, BLUE_L, 0.5)
    y += 3

    text(doc, 'ACCOUNT SUMMARY', M, y + 3.5, { size: 6, style: 'bold', color: DGRAY })
    y += 6

    const labelW = 24
    const nFees  = feeTypes.length
    const feeW   = Math.floor((CW - labelW) / (nFees + 1))
    const totalW = CW - labelW - feeW * nFees

    fillRect(doc, M, y, CW, 5, [50, 80, 130])
    feeTypes.forEach((ft, i) => {
      const cx = M + labelW + i * feeW + feeW - 1
      const lbl = ft.label.length > 9 ? ft.label.slice(0, 8) + '.' : ft.label
      text(doc, lbl, cx, y + 3.5, { size: 5.5, style: 'bold', color: WHITE, align: 'right' })
    })
    text(doc, 'TOTAL', M + labelW + feeW * nFees + totalW - 1, y + 3.5,
      { size: 5.5, style: 'bold', color: WHITE, align: 'right' })
    y += 5

    // Calcul des valeurs par type – utilise le label en priorité pour correspondre aux paiements récents
    const valsAnnual = feeTypes.map(ft => ft.annual)
    const valsPaid   = feeTypes.map(ft => {
      const byLabel = paidByLabel[(ft.label || '').toLowerCase()] || 0
      const byType  = paidByType[(ft.type || '').toLowerCase()] || 0
      return byLabel > 0 ? byLabel : byType
    })
    const valsBalance = feeTypes.map((ft, i) => Math.max(0, ft.annual - valsPaid[i]))

    const summaryRows = [
      {
        label: 'Annual Due',
        bg: LGRAY,
        color: BLACK,
        vals: valsAnnual,
        total: totalAnnualDue,
      },
      {
        label: 'Total Paid',
        bg: [235, 252, 240],
        color: GREEN,
        vals: valsPaid,
        total: valsPaid.reduce((s, v) => s + v, 0),
      },
      {
        label: 'Balance',
        bg: totalBalance > 0 ? ABGC : GBG,
        color: totalBalance > 0 ? AMBER : GREEN,
        vals: valsBalance,
        total: valsBalance.reduce((s, v) => s + v, 0),
      },
    ]

    summaryRows.forEach((row, ri) => {
      fillRect(doc, M, y, CW, 5, row.bg)
      strokeRect(doc, M, y, CW, 5, MGRAY, 0.1)
      text(doc, row.label, M + 2, y + 3.5, { size: 5.5, style: 'bold', color: DGRAY })
      row.vals.forEach((val, i) => {
        const cx = M + labelW + i * feeW + feeW - 1
        text(doc, fmtGHS(val), cx, y + 3.5, { size: 5.5, color: row.color, align: 'right' })
      })
      text(doc, fmtGHS(row.total),
        M + labelW + feeW * nFees + totalW - 1, y + 3.5,
        { size: 5.5, style: 'bold', color: row.color, align: 'right' })
      y += 5
    })
    y += 4
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6. NOTES
  // ════════════════════════════════════════════════════════════════════════
  if (notes) {
    text(doc, 'Note: ' + notes, M, y + 3, { size: 7, color: DGRAY, maxWidth: CW })
    y += 8
  }

  // ════════════════════════════════════════════════════════════════════════
  // 7. SIGNATURE
  // ════════════════════════════════════════════════════════════════════════
  y = Math.max(y, A5_H - 32)
  hline(doc, y, [200, 210, 230], 0.3)
  y += 4
  text(doc, 'Received by:', M, y, { size: 7, style: 'bold', color: DGRAY })
  text(doc, payment.collected_by_name || '________________', M, y + 6, { size: 7.5, color: BLACK })
  const sigX = A5_W - M - 45
  text(doc, 'Signature / Stamp:', sigX, y, { size: 7, style: 'bold', color: DGRAY })
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(0.3)
  doc.line(sigX, y + 9, A5_W - M, y + 9)

  // ════════════════════════════════════════════════════════════════════════
  // 8. PIED DE PAGE
  // ════════════════════════════════════════════════════════════════════════
  fillRect(doc, 0, A5_H - 9, A5_W, 9, BLUE)
  text(doc, 'Computer-generated receipt — valid without stamp.  SMS confirmation sent to parent.',
    A5_W / 2, A5_H - 3.5, { size: 6, color: [180, 210, 245], align: 'center' })

  // ── Ouverture dans nouvel onglet ────────────────────────────────────────
  const blob = doc.output('blob')
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
}