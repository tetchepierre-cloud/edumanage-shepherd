// src/lib/feesReportGenerator.js
// Rapport des Frais Scolaires — optimisé (appels groupés)

import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

const A4_W = 210, A4_H = 297, M = 12, CW = A4_W - M * 2

// Couleurs (inchangé)
const BLUE    = [30, 77, 145], BLUE_LT = [214, 228, 247], LGRAY   = [245, 247, 250]
const MGRAY   = [226, 232, 240], DGRAY   = [107, 114, 128], BLACK   = [17, 24, 39]
const GREEN   = [22, 101, 52],  GREEN_L = [220, 252, 231], AMBER   = [146, 64, 14]
const AMBER_L = [254, 243, 199], RED     = [153, 27, 27],  RED_L   = [254, 226, 226]
const WHITE   = [255, 255, 255], GOLD    = [255, 215, 0]

// Helpers (inchangé)
function fillRect(doc, x, y, w, h, color) { doc.setFillColor(...color); doc.rect(x, y, w, h, 'F') }
function strokeRect(doc, x, y, w, h, color, lw = 0.2) { doc.setDrawColor(...color); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S') }
function txt(doc, str, x, y, opts = {}) { doc.setTextColor(...(opts.color || BLACK)); doc.setFontSize(opts.size || 8); doc.setFont('helvetica', opts.style || 'normal'); doc.text(String(str ?? ''), x, y, { align: opts.align || 'left', maxWidth: opts.maxWidth }) }
function hline(doc, y, color = MGRAY, lw = 0.2) { doc.setDrawColor(...color); doc.setLineWidth(lw); doc.line(M, y, A4_W - M, y) }
function fmtGHS(n) { return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 }) }

// ── Chargement groupé des classes et élèves ─────────────────────────
async function loadAllClassesAndStudents({ classIds, levelIds, academicYear }) {
  // 1. Toutes les classes (filtrées) – on a besoin du level_id maintenant
  let classQuery = supabase.from('classes').select('id, name, level_id').order('name')
  if (classIds?.length) classQuery = classQuery.in('id', classIds)
  else if (levelIds?.length) {
    classQuery = classQuery.in('level_id', levelIds)
  }
  const { data: classes } = await classQuery
  if (!classes?.length) return { classes: [], students: [], studentIds: [], levelNames: [], studentLevelMap: {} }

  const classIdsArr = classes.map(c => c.id)
  // Extraire les noms de niveaux à partir des classes (pour compatibilité)
  const levelNames = [...new Set(classes.map(c => c.name.replace(/\s*[A-Za-z]$/, '').trim()))]

  // 2. Tous les élèves actifs de ces classes
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name, class_id')
    .in('class_id', classIdsArr)
    .eq('active', true)

  const studentIds = (students || []).map(s => s.id)

  // Construire une map étudiant → level_id (grâce à la classe)
  const classLevelMap = {}
  classes.forEach(c => { classLevelMap[c.id] = c.level_id })
  const studentLevelMap = {}
  ;(students || []).forEach(s => { studentLevelMap[s.id] = classLevelMap[s.class_id] })

  return { classes, students: students || [], studentIds, levelNames, studentLevelMap }
}

// ── Chargement groupé des attendus (schedules + discounts) ──────────
async function loadExpectedData(levelNames, academicYear, dateTo, studentIds, studentLevelMap) {
  // Levels -> ids
  const { data: levels } = await supabase
    .from('levels')
    .select('id, name')
    .in('name', levelNames)
    .eq('is_active', true)
  if (!levels?.length) return { expectedMap: new Map() }

  const levelIds = levels.map(l => l.id)
  // Tous les frais actifs de ces niveaux
  const { data: fees } = await supabase
    .from('fee_structure')
    .select('id, amount, level_id')
    .in('level_id', levelIds)
    .eq('academic_year', academicYear)
    .eq('is_active', true)
  if (!fees?.length) return { expectedMap: new Map() }

  const feeIds = fees.map(f => f.id)

  // Tous les schedules échus pour ces frais
  const { data: schedules } = await supabase
    .from('fee_schedules')
    .select('amount, fee_structure_id')
    .in('fee_structure_id', feeIds)
    .lte('due_date', dateTo.toISOString().split('T')[0])

  // Total par fee_structure_id
  const totalByFee = {}
  ;(schedules || []).forEach(s => {
    totalByFee[s.fee_structure_id] = (totalByFee[s.fee_structure_id] || 0) + parseFloat(s.amount || 0)
  })

  // Discounts pour les élèves concernés
  const { data: discounts } = await supabase
    .from('student_fee_discounts')
    .select('student_id, fee_structure_id, discount_type, discount_value')
    .in('student_id', studentIds)

  const discountIndex = {}
  ;(discounts || []).forEach(d => {
    if (!discountIndex[d.student_id]) discountIndex[d.student_id] = {}
    discountIndex[d.student_id][d.fee_structure_id] = d
  })

  // Construire une map : studentId -> total attendu (filtré par niveau de l'élève)
  const expectedMap = new Map()
  studentIds.forEach(sid => {
    const stuLevel = studentLevelMap[sid]   // ← level_id de l'élève
    if (!stuLevel) return

    let total = 0
    fees.forEach(f => {
      if (f.level_id !== stuLevel) return   // ← on saute les frais qui ne concernent pas ce niveau
      let feeTotal = totalByFee[f.id] || 0
      const disc = discountIndex[sid]?.[f.id]
      if (disc) {
        if (disc.discount_type === 'fixed') feeTotal = Math.max(0, feeTotal - parseFloat(disc.discount_value))
        else feeTotal *= (1 - parseFloat(disc.discount_value) / 100)
      }
      total += feeTotal
    })
    expectedMap.set(sid, parseFloat(total.toFixed(2)))
  })

  return { expectedMap, levels, fees, totalByFee, discountIndex }
}

// ── Chargement groupé des paiements (tous élèves d'un coup) ─────────
async function loadPaymentsData(studentIds, academicYear, dateFrom, dateTo) {
  if (!studentIds.length) return new Map()

  const { data: payments } = await supabase
    .from('fee_payments')
    .select('student_id, amount')
    .in('student_id', studentIds)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial'])
    .gte('payment_date', dateFrom.toISOString().split('T')[0])
    .lte('payment_date', dateTo.toISOString().split('T')[0])

  const paidMap = new Map()
  ;(payments || []).forEach(p => {
    paidMap.set(p.student_id, (paidMap.get(p.student_id) || 0) + parseFloat(p.amount || 0))
  })
  return paidMap
}

// ════════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE (optimisée)
// ════════════════════════════════════════════════════════════════════════════
export async function generateFeesReport({
  academicYear = '2025/2026',
  dateFrom,
  dateTo,
  classIds = null,
  levelIds = null,
  tableType = 'class',
  showOnlyActive = false,
  schoolConfig = {},
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  if (!dateFrom || !dateTo) {
    txt(doc, 'Error: date range not provided.', M, 40, { size: 10, color: RED })
    window.open(URL.createObjectURL(doc.output('blob')), '_blank')
    return
  }

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
      console.warn('Logo could not be loaded for fee report.')
    }
  }

  // 1. Charger classes, élèves
  const { classes, students, studentIds, levelNames, studentLevelMap } =
    await loadAllClassesAndStudents({ classIds, levelIds, academicYear })

  if (!classes.length || !students.length) {
    txt(doc, 'No data found.', M, 40, { size: 10, color: RED })
    window.open(URL.createObjectURL(doc.output('blob')), '_blank')
    return
  }

  // 2. Charger attendus et paiements en masse
  const { expectedMap } = await loadExpectedData(levelNames, academicYear, dateTo, studentIds, studentLevelMap)
  const paidMap = await loadPaymentsData(studentIds, academicYear, dateFrom, dateTo)

  // 3. Construire les lignes sans aucun appel réseau
  const allRows = []
  if (tableType === 'student') {
    for (const stu of students) {
      const cls = classes.find(c => c.id === stu.class_id)
      const expected = expectedMap.get(stu.id) || 0
      const collected = paidMap.get(stu.id) || 0
      const outstanding = expected - collected
      const rate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 1000) / 10) : 0
      const status = outstanding <= 0 ? 'Up to date' : 'Overdue'
      allRows.push({
        type: 'student',
        className: cls?.name || '—',
        studentName: `${stu.first_name} ${stu.last_name}`,
        status,
        expected,
        collected,
        outstanding,
        rate,
        hasSchedule: expectedMap.has(stu.id)
      })
    }
  } else {
    // Par classe : agréger les élèves
    const classAgg = {}
    for (const stu of students) {
      const clsId = stu.class_id
      if (!classAgg[clsId]) classAgg[clsId] = { students: 0, expected: 0, collected: 0 }
      classAgg[clsId].students += 1
      classAgg[clsId].expected += expectedMap.get(stu.id) || 0
      classAgg[clsId].collected += paidMap.get(stu.id) || 0
    }
    for (const cls of classes) {
      const agg = classAgg[cls.id]
      if (!agg) continue
      const expected = agg.expected
      const collected = agg.collected
      const outstanding = expected - collected
      const rate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 1000) / 10) : 0
      allRows.push({
        type: 'class',
        className: cls.name,
        students: agg.students,
        expected,
        collected,
        outstanding,
        rate,
        hasSchedule: expected > 0 || collected > 0
      })
    }
  }

  // Filtrer
  const rowsToRender = showOnlyActive ? allRows.filter(r => r.collected > 0) : allRows
  const scheduledRows = rowsToRender.filter(r => r.expected > 0)
  const totalExpected = scheduledRows.reduce((s, r) => s + r.expected, 0)
  const totalCollected = rowsToRender.reduce((s, r) => s + r.collected, 0)
  const totalOutstanding = totalExpected - totalCollected
  const overallRate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 1000) / 10) : 0

  // ═══════════════ DESSIN ═══════════════
  let y = 0
  fillRect(doc, 0, 0, A4_W, 28, BLUE)

  if (logoData) {
    const logoSize = 18
    doc.addImage(logoData, 'JPEG', M + 2, 5, logoSize, logoSize)
    const textX = M + 2 + logoSize + 3
    txt(doc, school.name, textX, 10, { size: 12, style: 'bold', color: WHITE })
    txt(doc, school.address + (school.phone ? `  |  Tel: ${school.phone}` : ''), textX, 17, { size: 7.5, color: [190, 215, 245] })
  } else {
    txt(doc, school.name, M + 20, 10, { size: 12, style: 'bold', color: WHITE })
    txt(doc, school.address + (school.phone ? `  |  Tel: ${school.phone}` : ''), M + 20, 17, { size: 7.5, color: [190, 215, 245] })
  }

  txt(doc, 'FEES COLLECTION REPORT', A4_W - M, 25, { size: 10, style: 'bold', color: GOLD, align: 'right' })
  y = 32
  const periodLabel = `${dateFrom.toLocaleDateString('en-GB')} – ${dateTo.toLocaleDateString('en-GB')}`
  txt(doc, `Period: ${periodLabel}  |  Academic Year ${academicYear}`, M, y, { size: 9, style: 'bold', color: BLACK })
  y += 10

  // KPIs
  const kpiW = (CW / 4) - 1.5
  const kpis = [
    { label: 'Expected',   value: totalExpected > 0 ? fmtGHS(totalExpected) : 'N/A',   color: BLUE,  bg: BLUE_LT },
    { label: 'Collected',  value: fmtGHS(totalCollected),  color: GREEN, bg: GREEN_L },
    { label: 'Outstanding',value: totalOutstanding > 0 ? fmtGHS(totalOutstanding) : (totalOutstanding < 0 ? 'Over ' + fmtGHS(-totalOutstanding) : fmtGHS(0)),
      color: totalOutstanding > 0 ? RED : (totalOutstanding < 0 ? GREEN : DGRAY),
      bg: totalOutstanding > 0 ? RED_L : (totalOutstanding < 0 ? GREEN_L : LGRAY) },
    { label: 'Coll. Rate', value: totalExpected > 0 ? `${overallRate.toFixed(1)}%` : 'N/A', color: BLUE, bg: BLUE_LT },
  ]
  kpis.forEach((k, i) => {
    const kx = M + i*(kpiW+2)
    fillRect(doc, kx, y, kpiW, 12, k.bg)
    strokeRect(doc, kx, y, kpiW, 12, k.color, 0.5)
    txt(doc, k.label, kx+2, y+4, { size: 7, style: 'bold', color: k.color })
    txt(doc, k.value, kx+2, y+9, { size: 8, style: 'bold', color: k.color })
  })
  y += 16

  // Tableau
  if (tableType === 'student') {
    const colW = [14, 38, 24, 26, 26, 26, 26]
    const colX = [M, M+colW[0], M+colW[0]+colW[1], M+colW[0]+colW[1]+colW[2], M+colW[0]+colW[1]+colW[2]+colW[3], M+colW[0]+colW[1]+colW[2]+colW[3]+colW[4], M+colW[0]+colW[1]+colW[2]+colW[3]+colW[4]+colW[5]]
    const headers = ['Status', 'Student', 'Class', 'Expected', 'Collected', 'Outstanding', 'Rate %']
    fillRect(doc, M, y, CW, 7, BLUE)
    headers.forEach((h, i) => { txt(doc, h, i>=3 ? colX[i]+colW[i]-1 : colX[i]+2, y+5, { size:7, style:'bold', color:WHITE, align: i>=3?'right':'left' }) })
    y += 7
    rowsToRender.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? WHITE : [250,250,252]
      fillRect(doc, M, y, CW, 6, bg)
      strokeRect(doc, M, y, CW, 6, MGRAY)
      txt(doc, r.status,                    colX[0]+2, y+4, { size:7, color: r.status==='Up to date' ? GREEN : RED })
      txt(doc, r.studentName,               colX[1]+2, y+4, { size:7, color: BLACK })
      txt(doc, r.className,                 colX[2]+2, y+4, { size:7, color: BLACK })
      txt(doc, r.expected > 0 ? fmtGHS(r.expected) : 'N/A', colX[3]+colW[3]-1, y+4, { size:7, color: r.expected>0 ? BLACK : DGRAY, align:'right' })
      txt(doc, fmtGHS(r.collected),         colX[4]+colW[4]-1, y+4, { size:7, color: r.collected>0 ? GREEN : DGRAY, align:'right' })
      if (r.outstanding > 0) txt(doc, fmtGHS(r.outstanding), colX[5]+colW[5]-1, y+4, { size:7, color: RED, align:'right' })
      else if (r.outstanding < 0) txt(doc, fmtGHS(0), colX[5]+colW[5]-1, y+4, { size:7, color: DGRAY, align:'right' })
      else txt(doc, fmtGHS(0), colX[5]+colW[5]-1, y+4, { size:7, color: DGRAY, align:'right' })
      txt(doc, r.expected > 0 ? `${r.rate.toFixed(1)}%` : 'N/A', colX[6]+colW[6]-1, y+4, { size:7, style:'bold', color: r.rate>=100 ? GREEN : (r.rate>=50 ? AMBER : RED), align:'right' })
      y += 6
    })
    hline(doc, y, BLUE, 0.5)
    y += 2
    fillRect(doc, M, y, CW, 8, BLUE_LT)
    strokeRect(doc, M, y, CW, 8, BLUE, 0.5)
    txt(doc, 'TOTAL', colX[0]+2, y+5, { size:8, style:'bold', color:BLUE })
    txt(doc, String(rowsToRender.length), colX[2]+2, y+5, { size:8, style:'bold', color:BLUE })
    txt(doc, totalExpected > 0 ? fmtGHS(totalExpected) : 'N/A', colX[3]+colW[3]-1, y+5, { size:8, style:'bold', color:BLUE, align:'right' })
    txt(doc, fmtGHS(totalCollected), colX[4]+colW[4]-1, y+5, { size:8, style:'bold', color:GREEN, align:'right' })
    txt(doc, totalOutstanding > 0 ? fmtGHS(totalOutstanding) : (totalOutstanding < 0 ? 'Over ' + fmtGHS(-totalOutstanding) : fmtGHS(0)), colX[5]+colW[5]-1, y+5, { size:8, style:'bold', color: totalOutstanding > 0 ? RED : (totalOutstanding < 0 ? GREEN : DGRAY), align:'right' })
    txt(doc, totalExpected > 0 ? `${overallRate.toFixed(1)}%` : 'N/A', colX[6]+colW[6]-1, y+5, { size:8, style:'bold', color:BLUE, align:'right' })
    y += 12
  } else {
    const colW = [40, 20, 30, 30, 30, 30]
    const colX = [M, M+colW[0], M+colW[0]+colW[1], M+colW[0]+colW[1]+colW[2], M+colW[0]+colW[1]+colW[2]+colW[3], M+colW[0]+colW[1]+colW[2]+colW[3]+colW[4]]
    const headers = ['Class', 'Students', 'Expected', 'Collected', 'Outstanding', 'Rate %']
    fillRect(doc, M, y, CW, 7, BLUE)
    headers.forEach((h, i) => { txt(doc, h, i>=2 ? colX[i]+colW[i]-1 : colX[i]+2, y+5, { size:7, style:'bold', color:WHITE, align: i>=2?'right':'left' }) })
    y += 7
    rowsToRender.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? WHITE : [250,250,252]
      fillRect(doc, M, y, CW, 6, bg)
      strokeRect(doc, M, y, CW, 6, MGRAY)
      txt(doc, r.className,                 colX[0]+2, y+4, { size:7, color: BLACK })
      txt(doc, String(r.students),          colX[1]+2, y+4, { size:7, color: BLACK })
      txt(doc, r.expected > 0 ? fmtGHS(r.expected) : 'N/A', colX[2]+colW[2]-1, y+4, { size:7, color: r.expected>0 ? BLACK : DGRAY, align:'right' })
      txt(doc, fmtGHS(r.collected),         colX[3]+colW[3]-1, y+4, { size:7, color: r.collected>0 ? GREEN : DGRAY, align:'right' })
      if (r.outstanding > 0) txt(doc, fmtGHS(r.outstanding), colX[4]+colW[4]-1, y+4, { size:7, color: RED, align:'right' })
      else if (r.outstanding < 0) txt(doc, fmtGHS(0), colX[4]+colW[4]-1, y+4, { size:7, color: DGRAY, align:'right' })
      else txt(doc, fmtGHS(0), colX[4]+colW[4]-1, y+4, { size:7, color: DGRAY, align:'right' })
      txt(doc, r.expected > 0 ? `${r.rate.toFixed(1)}%` : 'N/A', colX[5]+colW[5]-1, y+4, { size:7, style:'bold', color: r.rate>=100 ? GREEN : (r.rate>=50 ? AMBER : RED), align:'right' })
      y += 6
    })
    hline(doc, y, BLUE, 0.5)
    y += 2
    fillRect(doc, M, y, CW, 8, BLUE_LT)
    strokeRect(doc, M, y, CW, 8, BLUE, 0.5)
    txt(doc, 'TOTAL', colX[0]+2, y+5, { size:8, style:'bold', color:BLUE })
    txt(doc, String(rowsToRender.reduce((s,r)=> s + (r.students||0), 0)), colX[1]+2, y+5, { size:8, style:'bold', color:BLUE })
    txt(doc, totalExpected > 0 ? fmtGHS(totalExpected) : 'N/A', colX[2]+colW[2]-1, y+5, { size:8, style:'bold', color:BLUE, align:'right' })
    txt(doc, fmtGHS(totalCollected), colX[3]+colW[3]-1, y+5, { size:8, style:'bold', color:GREEN, align:'right' })
    txt(doc, totalOutstanding > 0 ? fmtGHS(totalOutstanding) : (totalOutstanding < 0 ? 'Over ' + fmtGHS(-totalOutstanding) : fmtGHS(0)), colX[4]+colW[4]-1, y+5, { size:8, style:'bold', color: totalOutstanding > 0 ? RED : (totalOutstanding < 0 ? GREEN : DGRAY), align:'right' })
    txt(doc, totalExpected > 0 ? `${overallRate.toFixed(1)}%` : 'N/A', colX[5]+colW[5]-1, y+5, { size:8, style:'bold', color:BLUE, align:'right' })
    y += 12
  }

  fillRect(doc, 0, A4_H - 9, A4_W, 9, BLUE)
  txt(doc, `Generated on ${new Date().toLocaleDateString('en-GB')} — ${school.name} — EduManage GH`,
    A4_W / 2, A4_H - 3.5, { size: 6.5, color: [180, 210, 245], align: 'center' })

  const blob = doc.output('blob')
  window.open(URL.createObjectURL(blob), '_blank')
}