// src/lib/receiptGenerator.js
import { jsPDF, GState } from 'jspdf'
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
}

export async function generateReceiptNumber() {
  const { data, error } = await supabase.rpc('next_receipt_number')
  if (error) throw error
  return data
}

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
  return fees.map(f => ({ id: f.id, label: f.fee_name, type: f.fee_type, annual: parseFloat(f.amount) }))
}

async function getStudentPaymentHistory(studentId, academicYear) {
  const { data, error } = await supabase
    .from('fee_payments')
    .select('amount, payment_type, status, fee_items, payment_date')
    .eq('student_id', studentId)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial'])
  if (error) console.error('Error fetching payment history:', error)
  return data || []
}

export async function printReceipt(payment, schoolConfig = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })

  const school = {
    name:    (schoolConfig.school_name || 'BRIGHT FUTURE SCHOOL').toUpperCase(),
    address: schoolConfig.address || 'Tamale, Northern Region',
    phone:   schoolConfig.phone   || '+233 20 000 0000',
    email:   schoolConfig.email   || '',
    logo:    schoolConfig.logo    || null,
  }

  // Charger le logo en base64 si une URL est fournie
  let logoData = null
  if (school.logo) {
    try {
      const response = await fetch(school.logo)
      const blob = await response.blob()
      const reader = new FileReader()
      logoData = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      console.warn('Logo could not be loaded, falling back to placeholder.')
    }
  }

  // ── Filigrane : logo de l'école en fond très discret, taille doublée ──────
  if (logoData) {
    doc.setGState(new GState({ opacity: 0.05 }))
    doc.addImage(logoData, 'PNG', A5_W / 2 - 50, A5_H / 2 - 50, 100, 100)
    doc.setGState(new GState({ opacity: 1 }))
  }

  const student         = payment.students || {}
  const className       = student.classes?.name || '—'
  const studentName     = `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—'
  const receiptNo       = payment.receipt_number
  const payDate         = payment.payment_date ? fmtDate(payment.payment_date) : fmtDate(payment.created_at)
  const year            = payment.academic_year  || '—'
  const method          = payment.payment_method || 'Cash'
  const notes           = payment.notes          || ''
  const amountPaidToday = parseFloat(payment.amount || 0)

  // Lignes de frais du jour
  let feeItems = Array.isArray(payment.feeItems) && payment.feeItems.length > 0
    ? payment.feeItems.map(item => ({
        description: item.description || item.type || 'Tuition',
        expected: parseFloat(item.expected || item.amount || 0),
        paid: parseFloat(item.paid || item.amount || 0)
      }))
    : [{ description: (payment.payment_type || 'Tuition') + ' (' + year + ')', expected: amountPaidToday, paid: amountPaidToday }]

  // Calcul du solde restant
  const annualStructure = await getAnnualFeeStructure(student, year)
  const { data: discounts } = await supabase
    .from('student_fee_discounts')
    .select('fee_structure_id, discount_type, discount_value')
    .eq('student_id', payment.student_id)
  const discountMap = {}
  ;(discounts || []).forEach(d => { discountMap[d.fee_structure_id] = d })
  const adjustedStructure = annualStructure.map(f => {
    let amount = f.annual
    const disc = discountMap[f.id]
    if (disc) {
      if (disc.discount_type === 'fixed') amount = Math.max(0, amount - parseFloat(disc.discount_value))
      else amount = amount * (1 - parseFloat(disc.discount_value) / 100)
    }
    return { ...f, annual: parseFloat(amount.toFixed(2)) }
  })
  const totalAnnualDue = adjustedStructure.reduce((s, ft) => s + ft.annual, 0)
  const history = await getStudentPaymentHistory(payment.student_id, year)
  const totalPaidAll = history.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const totalBalance = Math.max(0, totalAnnualDue - totalPaidAll)

  let y = 0

  // 1. HEADER
  fillRect(doc, 0, 0, A5_W, 30, BLUE)
  if (logoData) {
    const logoSize = 18
    doc.addImage(logoData, 'JPEG', M + 2, 8, logoSize, logoSize)
    const textX = M + 2 + logoSize + 2
    text(doc, school.name, textX, 10, { size: 10, style: 'bold', color: WHITE })
    text(doc, school.address + (school.phone ? '  |  Tel: ' + school.phone : ''), textX, 16, { size: 7, color: [180, 210, 245] })
    if (school.email) text(doc, school.email, textX, 22, { size: 6.5, color: [180, 210, 245] })
  } else {
    doc.setFillColor(...WHITE)
    doc.circle(M + 7, 15, 6, 'F')
    text(doc, '🏫', M + 3.5, 17, { size: 9, color: BLUE })
    text(doc, school.name, M + 18, 10, { size: 10, style: 'bold', color: WHITE })
    text(doc, school.address + (school.phone ? '  |  Tel: ' + school.phone : ''), M + 18, 16, { size: 7, color: [180, 210, 245] })
    if (school.email) text(doc, school.email, M + 18, 22, { size: 6.5, color: [180, 210, 245] })
  }
  text(doc, 'OFFICIAL PAYMENT RECEIPT', A5_W - M, 26, { size: 7.5, style: 'bold', color: GOLD, align: 'right' })
  y = 34

  // 2. BANDE N° REÇU
  fillRect(doc, 0, y, A5_W, 8, BLUE_L)
  text(doc, 'Receipt No.:', M, y + 5.5, { size: 7.5, style: 'bold', color: BLUE })
  text(doc, receiptNo, M + 21, y + 5.5, { size: 8.5, style: 'bold', color: BLUE })
  text(doc, 'Date: ' + payDate, A5_W - M, y + 5.5, { size: 7, color: BLACK, align: 'right' })
  y += 11

  // 3. INFOS ÉLÈVE
  fillRect(doc, M, y, CW, 24, LGRAY)
  strokeRect(doc, M, y, CW, 24, [200, 210, 225])
  const col2 = M + CW / 2 + 2
  const infoRows = [
    ['Student', studentName, 'Academic Year', year],
    ['Student ID', payment.student_id?.slice(0,8)?.toUpperCase() || '—', 'Method', method],
    ['Class', className, '', ''],
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

  // 4. TABLEAU DU PAIEMENT DU JOUR
  text(doc, 'THIS PAYMENT', M, y + 4, { size: 7.5, style: 'bold', color: BLUE })
  y += 6

  fillRect(doc, M, y, CW, 6.5, BLUE)
  text(doc, 'Description', M + 2, y + 4.5, { size: 8, style: 'bold', color: WHITE })
  text(doc, 'Expected', M + CW * 0.55, y + 4.5, { size: 8, style: 'bold', color: WHITE })
  text(doc, 'Paid', A5_W - M - 2, y + 4.5, { size: 8, style: 'bold', color: WHITE, align: 'right' })
  y += 6.5

  let paidY = y
  feeItems.forEach((item, idx) => {
    const bgColor = idx % 2 === 0 ? WHITE : [250, 250, 252]
    fillRect(doc, M, paidY, CW, 7, bgColor)
    strokeRect(doc, M, paidY, CW, 7, MGRAY)
    text(doc, item.description, M + 2, paidY + 5, { size: 8, color: BLACK })
    text(doc, fmtGHS(item.expected), M + CW * 0.55, paidY + 5, { size: 8, color: DGRAY })
    text(doc, fmtGHS(item.paid), A5_W - M - 2, paidY + 5, { size: 8, style: 'bold', color: BLACK, align: 'right' })
    paidY += 7
  })

  fillRect(doc, M, paidY, CW, 9, GBG)
  strokeRect(doc, M, paidY, CW, 9, GREEN, 0.4)
  text(doc, 'TOTAL PAID TODAY', M + 2, paidY + 6, { size: 9, style: 'bold', color: GREEN })
  text(doc, fmtGHS(amountPaidToday), A5_W - M - 2, paidY + 6, { size: 10, style: 'bold', color: GREEN, align: 'right' })
  paidY += 11

  if (totalBalance > 0) {
    text(doc, 'Balance Remaining:', M + 2, paidY + 5, { size: 8, style: 'bold', color: AMBER })
    text(doc, fmtGHS(totalBalance), A5_W - M - 2, paidY + 5, { size: 8, style: 'bold', color: AMBER, align: 'right' })
    paidY += 8
  }

  y = paidY + 4

  // 5. NOTES
  if (notes) {
    text(doc, 'Note: ' + notes, M, y + 3, { size: 7, color: DGRAY, maxWidth: CW })
    y += 8
  }

  // 6. SIGNATURE (remontée) + Thank you fixe
  const signatureY = A5_H - 74
  y = signatureY

  hline(doc, y, [200, 210, 230], 0.3)
  y += 4
  text(doc, 'Received by:', M, y, { size: 7, style: 'bold', color: DGRAY })
  text(doc, payment.collected_by_name || '________________', M, y + 6, { size: 7.5, color: BLACK })
  text(doc, 'Signature:', M + 45, y, { size: 7, style: 'bold', color: DGRAY })
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(0.3)
  doc.line(M + 60, y + 18, A5_W - M, y + 18)

  text(doc, 'Thank you for trusting us!', A5_W / 2, A5_H - 28, { size: 8, style: 'bold', color: GREEN, align: 'center' })

  // 7. PIED DE PAGE (hauteur 4,5 mm, textes centrés verticalement à 2,25 mm du bas)
  fillRect(doc, 0, A5_H - 4.5, A5_W, 4.5, BLUE)
  const footerTextY = A5_H - 1.8;  // 2.25 + 0.45 ≈ 1.8 pour un centrage optimal visuel
  // Partie gauche
  text(doc, `Generated on ${new Date().toLocaleDateString('en-GB')} — ${school.name}`,
    M, footerTextY, { size: 6, color: [180, 210, 245], align: 'left' })
  // Partie droite
  text(doc, 'Powered by EduManage GH  •  +233 53 877 7840',
    A5_W - M, footerTextY, { size: 6, color: [180, 210, 245], align: 'right' })

  const blob = doc.output('blob')
  window.open(URL.createObjectURL(blob), '_blank')
}