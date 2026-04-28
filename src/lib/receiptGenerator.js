// src/lib/receiptGenerator.js
// Génère un reçu de paiement PDF A5 directement dans le navigateur
// Format N° reçu : PAYAAAANNNNmmm ex: PAY20260001JAN

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

// ── Historique paiements élève pour l'année ───────────────────────────────────
async function getStudentPaymentHistory(studentId, academicYear) {
  const { data } = await supabase
    .from('fee_payments')
    .select('amount, payment_type, status')
    .eq('student_id', studentId)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial'])
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
  const payDate         = fmtDate(payment.created_at)
  const term            = payment.term           || '—'
  const year            = payment.academic_year  || '—'
  const method          = payment.payment_method || 'Cash'
  const status          = payment.status         || 'paid'
  const notes           = payment.notes          || ''
  const amountPaidToday = parseFloat(payment.amount || 0)
  const paymentType     = payment.payment_type   || 'Tuition'

  // ── Fee structure (prestations annuelles) ────────────────────────────────
  const feeStructure = Array.isArray(payment.feeItems) && payment.feeItems.length > 0
    ? payment.feeItems
    : []

  // Prestations avec montant annuel
  const feeTypes = feeStructure.map(f => ({
    label:  f.description.split(' (')[0],
    type:   f.description.match(/\(([^)]+)\)/)?.[1] || f.description.split(' (')[0],
    annual: parseFloat(f.expected || 0),
  }))

  // ── Historique complet des paiements de l'élève ──────────────────────────
  const history = await getStudentPaymentHistory(payment.student_id, year)

  // Total payé par type (insensible à la casse)
  const paidByType = {}
  history.forEach(p => {
    const key = (p.payment_type || '').toLowerCase()
    paidByType[key] = (paidByType[key] || 0) + parseFloat(p.amount || 0)
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
    ['Student ID', payment.student_id?.slice(0,8)?.toUpperCase() || '—', 'Term', term],
    ['Class',      className,    'Method',        method],
  ]
  let iy = y + 6
  infoRows.forEach(([l1, v1, l2, v2]) => {
    text(doc, l1 + ':', M + 2, iy, { size: 7, style: 'bold', color: DGRAY })
    text(doc, v1, M + 19, iy, { size: 7.5, color: BLACK })
    text(doc, l2 + ':', col2, iy, { size: 7, style: 'bold', color: DGRAY })
    text(doc, v2, col2 + 19, iy, { size: 7.5, color: BLACK })
    iy += 7
  })
  y += 27

  // ════════════════════════════════════════════════════════════════════════
  // 4. CE PAIEMENT AUJOURD'HUI (taille normale)
  // ════════════════════════════════════════════════════════════════════════
  text(doc, 'THIS PAYMENT', M, y + 4, { size: 7.5, style: 'bold', color: BLUE })
  y += 6

  // En-tête
  fillRect(doc, M, y, CW, 6.5, BLUE)
  text(doc, 'Description', M + 2, y + 4.5, { size: 8, style: 'bold', color: WHITE })
  text(doc, 'Amount Paid', A5_W - M - 2, y + 4.5, { size: 8, style: 'bold', color: WHITE, align: 'right' })
  y += 6.5

  // Ligne paiement
  fillRect(doc, M, y, CW, 8, WHITE)
  strokeRect(doc, M, y, CW, 8, MGRAY)
  text(doc, paymentType + ' — ' + term + ' (' + year + ')', M + 2, y + 5.5, { size: 9, color: BLACK })
  text(doc, fmtGHS(amountPaidToday), A5_W - M - 2, y + 5.5, { size: 9, style: 'bold', color: BLACK, align: 'right' })
  y += 8

  // Total today
  const todayBg  = status === 'paid' ? GBG : ABGC
  const todayCol = status === 'paid' ? GREEN : AMBER
  fillRect(doc, M, y, CW, 9, todayBg)
  strokeRect(doc, M, y, CW, 9, todayCol, 0.4)
  text(doc, status === 'paid' ? '✓  FULLY PAID' : '⚠  PARTIAL PAYMENT',
    M + 2, y + 6, { size: 9, style: 'bold', color: todayCol })
  text(doc, fmtGHS(amountPaidToday), A5_W - M - 2, y + 6,
    { size: 10, style: 'bold', color: todayCol, align: 'right' })
  y += 13

  // ════════════════════════════════════════════════════════════════════════
  // 5. RÉCAPITULATIF DU COMPTE PAR PRESTATION (taille réduite)
  // ════════════════════════════════════════════════════════════════════════
  if (feeTypes.length > 0) {
    hline(doc, y, BLUE_L, 0.5)
    y += 3

    text(doc, 'ACCOUNT SUMMARY', M, y + 3.5, { size: 6, style: 'bold', color: DGRAY })
    y += 6

    // Largeurs colonnes
    const labelW = 24
    const nFees  = feeTypes.length
    const feeW   = Math.floor((CW - labelW) / (nFees + 1)) // +1 pour colonne TOTAL
    const totalW = CW - labelW - feeW * nFees

    // En-tête colonnes (size 5.5 — réduit)
    fillRect(doc, M, y, CW, 5, [50, 80, 130])
    feeTypes.forEach((ft, i) => {
      const cx = M + labelW + i * feeW + feeW - 1
      const lbl = ft.label.length > 9 ? ft.label.slice(0, 8) + '.' : ft.label
      text(doc, lbl, cx, y + 3.5, { size: 5.5, style: 'bold', color: WHITE, align: 'right' })
    })
    text(doc, 'TOTAL', M + labelW + feeW * nFees + totalW - 1, y + 3.5,
      { size: 5.5, style: 'bold', color: WHITE, align: 'right' })
    y += 5

    // 3 lignes : Annual Due / Total Paid / Balance
    // Utilisation de la clé insensible à la casse pour les paiements
    const summaryRows = [
      {
        label: 'Annual Due',
        bg: LGRAY,
        color: BLACK,
        vals: feeTypes.map(ft => ft.annual),
        total: totalAnnualDue,
      },
      {
        label: 'Total Paid',
        bg: [235, 252, 240],
        color: GREEN,
        vals: feeTypes.map(ft => paidByType[(ft.type || '').toLowerCase()] || 0),
        total: totalPaidAll,
      },
      {
        label: 'Balance',
        bg: totalBalance > 0 ? ABGC : GBG,
        color: totalBalance > 0 ? AMBER : GREEN,
        vals: feeTypes.map(ft => Math.max(0, ft.annual - (paidByType[(ft.type || '').toLowerCase()] || 0))),
        total: totalBalance,
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

  // ── Ouverture dans nouvel onglet (sans téléchargement) ────────────────────
  const blob = doc.output('blob')
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
}