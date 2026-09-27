// src/lib/classBalanceReportGenerator.js
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

const A4_W = 210, A4_H = 297, M = 12, CW = A4_W - M * 2

const BLUE    = [30, 77, 145]
const BLUE_LT = [214, 228, 247]
const BLACK   = [17, 24, 39]
const GREEN   = [22, 101, 52]
const GREEN_L = [220, 252, 231]
const RED     = [153, 27, 27]
const RED_L   = [254, 226, 226]
const AMBER   = [146, 64, 14]
const DGRAY   = [107, 114, 128]
const MGRAY   = [226, 232, 240]
const GOLD    = [255, 215, 0]
const WHITE   = [255, 255, 255]

function fillRect(doc, x, y, w, h, color) { doc.setFillColor(...color); doc.rect(x, y, w, h, 'F') }
function strokeRect(doc, x, y, w, h, color, lw = 0.2) { doc.setDrawColor(...color); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S') }
function txt(doc, str, x, y, opts = {}) { doc.setTextColor(...(opts.color || BLACK)); doc.setFontSize(opts.size || 8); doc.setFont('helvetica', opts.style || 'normal'); doc.text(String(str ?? ''), x, y, { align: opts.align || 'left', maxWidth: opts.maxWidth }) }
function fmtGHS(n) { return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 }) }

// ─────────────────────────────────────────────────────────────
// CHARGEMENT GROUPÉ DE TOUTES LES DONNÉES
// ─────────────────────────────────────────────────────────────
async function loadAllData({ mode, classId, academicYear, term }) {
  // 1. Classes
  let classQuery = supabase
    .from('classes')
    .select('id, name, level_id, sort_order')
    .order('sort_order')
  if (mode === 'class' && classId) {
    classQuery = classQuery.eq('id', classId)
  }
  const { data: classes } = await classQuery
  if (!classes?.length) return null

  const classIds = classes.map(c => c.id)
  const levelIds = [...new Set(classes.map(c => c.level_id).filter(Boolean))]

  // 2. Élèves ACTIFS uniquement
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name, class_id')
    .in('class_id', classIds)
    .eq('status', 'active')
    .order('last_name')

  if (!students?.length) {
    return { classes, students: [], studentRows: [], classTotals: {} }
  }

  const studentIds = students.map(s => s.id)

  // 3. Frais
  let feeQuery = supabase
    .from('fee_structure')
    .select('id, amount, level_id')
    .in('level_id', levelIds)
    .eq('academic_year', academicYear)
    .eq('is_active', true)
  if (term) feeQuery = feeQuery.eq('term', term)
  const { data: fees } = await feeQuery

  // 4. Données liées (en parallèle)
  const [discountsRes, overridesRes, optionalsRes, paymentsRes] = await Promise.all([
    supabase.from('student_fee_discounts').select('student_id, fee_structure_id, discount_type, discount_value').in('student_id', studentIds),
    supabase.from('student_fee_overrides').select('student_id, fee_structure_id, override_amount').in('student_id', studentIds),
    supabase.from('student_optional_fees').select('student_id, amount').in('student_id', studentIds).eq('academic_year', academicYear).eq('is_active', true),
    supabase.from('fee_payments').select('student_id, amount').in('student_id', studentIds).eq('academic_year', academicYear).in('status', ['paid', 'partial']),
  ])

  // 5. Indexation
  const feesByLevel = {}
  ;(fees || []).forEach(f => {
    if (!feesByLevel[f.level_id]) feesByLevel[f.level_id] = []
    feesByLevel[f.level_id].push(f)
  })

  const discountBySF = {}
  ;(discountsRes.data || []).forEach(d => { discountBySF[`${d.student_id}|${d.fee_structure_id}`] = d })

  const overrideBySF = {}
  ;(overridesRes.data || []).forEach(o => { overrideBySF[`${o.student_id}|${o.fee_structure_id}`] = o.override_amount })

  const optionalByStudent = {}
  ;(optionalsRes.data || []).forEach(o => { optionalByStudent[o.student_id] = (optionalByStudent[o.student_id] || 0) + parseFloat(o.amount || 0) })

  const paidByStudent = {}
  ;(paymentsRes.data || []).forEach(p => { paidByStudent[p.student_id] = (paidByStudent[p.student_id] || 0) + parseFloat(p.amount || 0) })

  const classLevelMap = {}
  classes.forEach(c => { classLevelMap[c.id] = c.level_id })

  // 6. Calcul par élève + agrégation par classe
  const studentRows = []
  const classTotals = {}
  classes.forEach(c => { classTotals[c.id] = { students: 0, expected: 0, paid: 0, balance: 0 } })

  students.forEach(stu => {
    const levelId = classLevelMap[stu.class_id]
    if (!levelId) return

    const levelFees = feesByLevel[levelId] || []
    let expected = 0
    levelFees.forEach(f => {
      let amount = overrideBySF[`${stu.id}|${f.id}`] !== undefined
        ? parseFloat(overrideBySF[`${stu.id}|${f.id}`])
        : parseFloat(f.amount)
      const disc = discountBySF[`${stu.id}|${f.id}`]
      if (disc) {
        if (disc.discount_type === 'fixed') amount = Math.max(0, amount - parseFloat(disc.discount_value))
        else amount *= (1 - parseFloat(disc.discount_value) / 100)
      }
      expected += amount
    })
    expected += optionalByStudent[stu.id] || 0

    const paid = paidByStudent[stu.id] || 0
    const balance = expected - paid

    studentRows.push({
      id: stu.id,
      name: `${stu.last_name} ${stu.first_name}`,
      classId: stu.class_id,
      expected: parseFloat(expected.toFixed(2)),
      paid: parseFloat(paid.toFixed(2)),
      balance: parseFloat(balance.toFixed(2)),
    })

    classTotals[stu.class_id].students += 1
    classTotals[stu.class_id].expected += expected
    classTotals[stu.class_id].paid += paid
    classTotals[stu.class_id].balance += balance
  })

  return { classes, students, studentRows, classTotals }
}

// ─────────────────────────────────────────────────────────────
// RENDU : MODE "SCHOOL" (résumé par classe)
// ─────────────────────────────────────────────────────────────
function renderSchoolSummary(doc, data, academicYear, term, y) {
  const { classes, classTotals } = data

  let totalExpected = 0, totalPaid = 0, totalStudents = 0
  classes.forEach(c => {
    const t = classTotals[c.id]
    if (!t) return
    totalExpected += t.expected
    totalPaid += t.paid
    totalStudents += t.students
  })
  const totalBalance = totalExpected - totalPaid
  const rate = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0

  let infoLine = `Academic Year: ${academicYear}    |    Total Students: ${totalStudents}`
  if (term) infoLine += `    |    ${term}`
  txt(doc, infoLine, M, y, { size: 9, style: 'bold', color: BLACK })
  y += 8

  // KPI
  const kpiW = (CW / 4) - 1.5
  const kpis = [
    { label: 'Expected', value: fmtGHS(totalExpected), bg: BLUE_LT, color: BLUE },
    { label: 'Paid',     value: fmtGHS(totalPaid),     bg: GREEN_L, color: GREEN },
    { label: 'Balance',  value: fmtGHS(totalBalance),  bg: totalBalance > 0 ? RED_L : GREEN_L, color: totalBalance > 0 ? RED : GREEN },
    { label: 'Rate %',   value: `${rate.toFixed(1)}%`, bg: BLUE_LT, color: BLUE },
  ]
  kpis.forEach((k, i) => {
    const kx = M + i * (kpiW + 2)
    fillRect(doc, kx, y, kpiW, 12, k.bg)
    strokeRect(doc, kx, y, kpiW, 12, k.color, 0.5)
    txt(doc, k.label, kx + 2, y + 4, { size: 7, style: 'bold', color: k.color })
    txt(doc, k.value, kx + 2, y + 9, { size: 8, style: 'bold', color: k.color })
  })
  y += 18

  // Tableau récapitulatif
  const colW = [50, 20, 30, 30, 30, 26]
  const colX = [M]
  for (let i = 1; i < colW.length; i++) colX.push(colX[i - 1] + colW[i - 1])
  const headers = ['Class', 'Students', 'Expected', 'Paid', 'Balance', 'Rate %']

  fillRect(doc, M, y, CW, 7, BLUE)
  headers.forEach((h, i) => {
    txt(doc, h, i >= 2 ? colX[i] + colW[i] - 1 : colX[i] + 2, y + 5, { size: 7, style: 'bold', color: WHITE, align: i >= 2 ? 'right' : 'left' })
  })
  y += 7

  classes.forEach((c, idx) => {
    if (y > A4_H - 30) { doc.addPage(); y = M; fillRect(doc, M, y, CW, 7, BLUE); headers.forEach((h, i) => { txt(doc, h, i >= 2 ? colX[i] + colW[i] - 1 : colX[i] + 2, y + 5, { size: 7, style: 'bold', color: WHITE, align: i >= 2 ? 'right' : 'left' }) }); y += 7 }
    const t = classTotals[c.id] || { students: 0, expected: 0, paid: 0, balance: 0 }
    const rate = t.expected > 0 ? (t.paid / t.expected) * 100 : 0
    const bg = idx % 2 === 0 ? WHITE : [250, 250, 252]
    fillRect(doc, M, y, CW, 6, bg)
    strokeRect(doc, M, y, CW, 6, MGRAY)
    txt(doc, c.name, colX[0] + 2, y + 4, { size: 7, color: BLACK })
    txt(doc, String(t.students), colX[1] + 2, y + 4, { size: 7, color: BLACK })
    txt(doc, fmtGHS(t.expected), colX[2] + colW[2] - 1, y + 4, { size: 7, color: BLACK, align: 'right' })
    txt(doc, fmtGHS(t.paid), colX[3] + colW[3] - 1, y + 4, { size: 7, color: GREEN, align: 'right' })
    txt(doc, fmtGHS(t.balance), colX[4] + colW[4] - 1, y + 4, { size: 7, style: 'bold', color: t.balance > 0 ? RED : GREEN, align: 'right' })
    txt(doc, `${rate.toFixed(1)}%`, colX[5] + colW[5] - 1, y + 4, { size: 7, color: rate >= 100 ? GREEN : (rate >= 50 ? AMBER : RED), align: 'right' })
    y += 6
  })

  // Total
  if (y > A4_H - 25) { doc.addPage(); y = M }
  fillRect(doc, M, y, CW, 8, BLUE_LT)
  strokeRect(doc, M, y, CW, 8, BLUE, 0.5)
  txt(doc, 'GRAND TOTAL', colX[0] + 2, y + 5, { size: 8, style: 'bold', color: BLUE })
  txt(doc, String(totalStudents), colX[1] + 2, y + 5, { size: 8, style: 'bold', color: BLUE })
  txt(doc, fmtGHS(totalExpected), colX[2] + colW[2] - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
  txt(doc, fmtGHS(totalPaid), colX[3] + colW[3] - 1, y + 5, { size: 8, style: 'bold', color: GREEN, align: 'right' })
  txt(doc, fmtGHS(totalBalance), colX[4] + colW[4] - 1, y + 5, { size: 8, style: 'bold', color: totalBalance > 0 ? RED : GREEN, align: 'right' })
  txt(doc, `${rate.toFixed(1)}%`, colX[5] + colW[5] - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
  y += 14

  return y
}

// ─────────────────────────────────────────────────────────────
// RENDU : MODE "CLASS" (détail par élève)
// ─────────────────────────────────────────────────────────────
function renderClassDetail(doc, data, className, academicYear, term, y) {
  const { classes, studentRows, classTotals } = data
  const cls = classes[0]
  if (!cls) return y

  const rows = studentRows.filter(r => r.classId === cls.id)
  const t = classTotals[cls.id] || { students: 0, expected: 0, paid: 0, balance: 0 }
  const rate = t.expected > 0 ? (t.paid / t.expected) * 100 : 0

  let infoLine = `Class: ${className || cls.name}    |    Academic Year: ${academicYear}    |    Students: ${t.students}`
  if (term) infoLine += `    |    ${term}`
  txt(doc, infoLine, M, y, { size: 9, style: 'bold', color: BLACK })
  y += 8

  // KPI
  const kpiW = (CW / 4) - 1.5
  const kpis = [
    { label: 'Expected', value: fmtGHS(t.expected), bg: BLUE_LT, color: BLUE },
    { label: 'Paid',     value: fmtGHS(t.paid),     bg: GREEN_L, color: GREEN },
    { label: 'Balance',  value: fmtGHS(t.balance),  bg: t.balance > 0 ? RED_L : GREEN_L, color: t.balance > 0 ? RED : GREEN },
    { label: 'Rate %',   value: `${rate.toFixed(1)}%`, bg: BLUE_LT, color: BLUE },
  ]
  kpis.forEach((k, i) => {
    const kx = M + i * (kpiW + 2)
    fillRect(doc, kx, y, kpiW, 12, k.bg)
    strokeRect(doc, kx, y, kpiW, 12, k.color, 0.5)
    txt(doc, k.label, kx + 2, y + 4, { size: 7, style: 'bold', color: k.color })
    txt(doc, k.value, kx + 2, y + 9, { size: 8, style: 'bold', color: k.color })
  })
  y += 18

  // Détail élèves
  const colW = [10, 70, 30, 30, 30, 26]
  const colX = [M]
  for (let i = 1; i < colW.length; i++) colX.push(colX[i - 1] + colW[i - 1])
  const headers = ['#', 'Name', 'Expected', 'Paid', 'Balance', 'Rate %']

  const drawHeader = () => {
    fillRect(doc, M, y, CW, 7, BLUE)
    headers.forEach((h, i) => {
      txt(doc, h, i >= 2 ? colX[i] + colW[i] - 1 : colX[i] + 2, y + 5, { size: 7, style: 'bold', color: WHITE, align: i >= 2 ? 'right' : 'left' })
    })
    y += 7
  }
  drawHeader()

  rows.forEach((r, idx) => {
    if (y > A4_H - 30) { doc.addPage(); y = M; drawHeader() }
    const rowRate = r.expected > 0 ? (r.paid / r.expected) * 100 : 0
    const bg = idx % 2 === 0 ? WHITE : [250, 250, 252]
    fillRect(doc, M, y, CW, 6, bg)
    strokeRect(doc, M, y, CW, 6, MGRAY)
    txt(doc, String(idx + 1), colX[0] + 2, y + 4, { size: 7, color: DGRAY })
    txt(doc, r.name, colX[1] + 2, y + 4, { size: 7, color: BLACK })
    txt(doc, fmtGHS(r.expected), colX[2] + colW[2] - 1, y + 4, { size: 7, color: BLACK, align: 'right' })
    txt(doc, fmtGHS(r.paid), colX[3] + colW[3] - 1, y + 4, { size: 7, color: GREEN, align: 'right' })
    txt(doc, fmtGHS(r.balance), colX[4] + colW[4] - 1, y + 4, { size: 7, style: 'bold', color: r.balance > 0 ? RED : GREEN, align: 'right' })
    txt(doc, `${rowRate.toFixed(1)}%`, colX[5] + colW[5] - 1, y + 4, { size: 7, color: rowRate >= 100 ? GREEN : (rowRate >= 50 ? AMBER : RED), align: 'right' })
    y += 6
  })

  if (y > A4_H - 25) { doc.addPage(); y = M }
  fillRect(doc, M, y, CW, 8, BLUE_LT)
  strokeRect(doc, M, y, CW, 8, BLUE, 0.5)
  txt(doc, 'TOTAL', colX[0] + 2, y + 5, { size: 8, style: 'bold', color: BLUE })
  txt(doc, fmtGHS(t.expected), colX[2] + colW[2] - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
  txt(doc, fmtGHS(t.paid), colX[3] + colW[3] - 1, y + 5, { size: 8, style: 'bold', color: GREEN, align: 'right' })
  txt(doc, fmtGHS(t.balance), colX[4] + colW[4] - 1, y + 5, { size: 8, style: 'bold', color: t.balance > 0 ? RED : GREEN, align: 'right' })
  txt(doc, `${rate.toFixed(1)}%`, colX[5] + colW[5] - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
  y += 14

  return y
}

// ─────────────────────────────────────────────────────────────
// POINT D'ENTRÉE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export async function generateClassBalanceReport({
  mode = 'school',        // 'school' = résumé par classe | 'class' = détail d'une classe
  classId = null,
  className = null,
  academicYear,
  schoolConfig = {},
  term = null,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  const school = {
    name:    (schoolConfig.school_name || 'SCHOOL NAME').toUpperCase(),
    address: schoolConfig.address || '',
    phone:   schoolConfig.phone   || '',
    email:   schoolConfig.email   || '',
    logo:    schoolConfig.logo    || null,
  }

  let logoData = null
  if (school.logo) {
    try {
      const response = await fetch(school.logo)
      const blob = await response.blob()
      const reader = new FileReader()
      logoData = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob) })
    } catch (e) {}
  }

  const data = await loadAllData({ mode, classId, academicYear, term })
  if (!data) {
    txt(doc, 'No data found.', M, 40, { size: 10, color: RED })
    window.open(URL.createObjectURL(doc.output('blob')), '_blank')
    return
  }

  // En-tête
  fillRect(doc, 0, 0, A4_W, 28, BLUE)
  if (logoData) {
    doc.addImage(logoData, 'JPEG', M + 2, 5, 18, 18)
    txt(doc, school.name, M + 24, 10, { size: 12, style: 'bold', color: WHITE })
    txt(doc, school.address + (school.phone ? `  |  Tel: ${school.phone}` : ''), M + 24, 17, { size: 7.5, color: [190, 215, 245] })
  } else {
    txt(doc, school.name, M + 2, 10, { size: 12, style: 'bold', color: WHITE })
    txt(doc, school.address + (school.phone ? `  |  Tel: ${school.phone}` : ''), M + 2, 17, { size: 7.5, color: [190, 215, 245] })
  }

  const reportTitle = mode === 'school'
    ? (term ? `WHOLE SCHOOL BALANCE — ${term}` : 'WHOLE SCHOOL BALANCE')
    : (term ? `CLASS BALANCE REPORT — ${term}` : 'CLASS BALANCE REPORT')
  txt(doc, reportTitle, A4_W - M, 25, { size: 10, style: 'bold', color: GOLD, align: 'right' })

  let y = 32

  if (mode === 'school') {
    y = renderSchoolSummary(doc, data, academicYear, term, y)
  } else {
    y = renderClassDetail(doc, data, className, academicYear, term, y)
  }

  // Pied de page
  fillRect(doc, 0, A4_H - 9, A4_W, 9, BLUE)
  txt(doc, `Generated on ${new Date().toLocaleDateString('en-GB')} — ${school.name} — EduManage GH`,
    A4_W / 2, A4_H - 3.5, { size: 6.5, color: [180, 210, 245], align: 'center' })

  window.open(URL.createObjectURL(doc.output('blob')), '_blank')
}