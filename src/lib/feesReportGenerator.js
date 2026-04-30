// src/lib/feesReportGenerator.js
// Rapport des Frais Scolaires — version corrigée (attendu × effectif)
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

// ── Mise en page A4 portrait ─────────────────────────────────────────────────
const A4_W = 210, A4_H = 297, M = 12, CW = A4_W - M * 2

// ── Couleurs ─────────────────────────────────────────────────────────────────
const BLUE    = [30, 77, 145]
const BLUE_LT = [214, 228, 247]
const LGRAY   = [245, 247, 250]
const MGRAY   = [226, 232, 240]
const DGRAY   = [107, 114, 128]
const BLACK   = [17, 24, 39]
const GREEN   = [22, 101, 52]
const GREEN_L = [220, 252, 231]
const AMBER   = [146, 64, 14]
const AMBER_L = [254, 243, 199]
const RED     = [153, 27, 27]
const RED_L   = [254, 226, 226]
const WHITE   = [255, 255, 255]
const GOLD    = [255, 215, 0]

// ── Helpers ──────────────────────────────────────────────────────────────────
function fillRect(doc, x, y, w, h, color) {
  doc.setFillColor(...color); doc.rect(x, y, w, h, 'F')
}
function strokeRect(doc, x, y, w, h, color, lw = 0.2) {
  doc.setDrawColor(...color); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S')
}
function txt(doc, str, x, y, opts = {}) {
  doc.setTextColor(...(opts.color || BLACK))
  doc.setFontSize(opts.size || 8)
  doc.setFont('helvetica', opts.style || 'normal')
  doc.text(String(str ?? ''), x, y, { align: opts.align || 'left', maxWidth: opts.maxWidth })
}
function hline(doc, y, color = MGRAY, lw = 0.2) {
  doc.setDrawColor(...color); doc.setLineWidth(lw); doc.line(M, y, A4_W - M, y)
}
function fmtGHS(n) {
  return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })
}

// ── Récupération des classes selon les filtres ──────────────────────────────
async function getFilteredClasses({ classIds, levelIds, academicYear }) {
  let classQuery = supabase.from('classes').select('id, name, level').order('name')

  if (classIds && classIds.length > 0) {
    classQuery = classQuery.in('id', classIds)
  } else if (levelIds && levelIds.length > 0) {
    const { data: levels } = await supabase.from('levels').select('id, name').in('id', levelIds)
    const levelNames = (levels || []).map(l => l.name)
    if (levelNames.length > 0) {
      const conditions = levelNames.map(name => `name.ilike.${name}%`)
      classQuery = classQuery.or(conditions.join(','))
    } else {
      return []
    }
  }
  const { data: classes } = await classQuery
  return classes || []
}

// ── Élèves actifs d'une classe ──────────────────────────────────────────────
async function getStudentsOfClass(classId) {
  const { data } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .eq('class_id', classId)
    .eq('active', true)
    .order('last_name')
  return data || []
}

// ── Frais schedule d'un niveau et année ────────────────────────────────────
async function getFeeSchedulesForLevel(levelName, academicYear) {
  const { data: level } = await supabase
    .from('levels')
    .select('id')
    .ilike('name', levelName)
    .maybeSingle()
  if (!level) return []

  const { data: fees } = await supabase
    .from('fee_structure')
    .select('id')
    .eq('level_id', level.id)
    .eq('academic_year', academicYear)
    .eq('is_active', true)

  if (!fees?.length) return []

  const feeIds = fees.map(f => f.id)
  const { data: schedules } = await supabase
    .from('fee_schedules')
    .select('due_date, amount')
    .in('fee_structure_id', feeIds)
    .order('due_date')

  return schedules || []
}

// ── Total attendu pour un niveau à une date donnée (par élève) ─────────────
async function getExpectedPerStudentForLevel(levelName, academicYear, dateTo) {
  const schedules = await getFeeSchedulesForLevel(levelName, academicYear)
  const dateToStr = dateTo.toISOString().split('T')[0]
  const total = schedules
    .filter(s => s.due_date <= dateToStr)
    .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0)
  return { total, hasSchedule: schedules.length > 0 }
}

// ── Total payé par un élève dans une période ───────────────────────────────
async function getStudentPayments(studentId, academicYear, dateFrom, dateTo) {
  const { data: payments } = await supabase
    .from('fee_payments')
    .select('amount')
    .eq('student_id', studentId)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial'])
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', new Date(dateTo.getTime() + 86399999).toISOString())

  return (payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
}

// ── Total payé pour un ensemble d'élèves ───────────────────────────────────
async function getTotalPaymentsForStudents(studentIds, academicYear, dateFrom, dateTo) {
  if (!studentIds.length) return 0
  const { data: payments } = await supabase
    .from('fee_payments')
    .select('amount')
    .in('student_id', studentIds)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial'])
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', new Date(dateTo.getTime() + 86399999).toISOString())

  return (payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
}

// ════════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════
export async function generateFeesReport({
  academicYear = '2025/2026',
  dateFrom,
  dateTo,
  classIds = null,
  levelIds = null,
  tableType = 'class',
  schoolConfig = {},
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  if (!dateFrom || !dateTo) {
    txt(doc, 'Error: date range not provided.', M, 40, { size: 10, color: RED })
    const blob = doc.output('blob')
    window.open(URL.createObjectURL(blob), '_blank')
    return
  }

  const school = {
    name:    (schoolConfig.school_name || 'BRIGHT FUTURE SCHOOL').toUpperCase(),
    address: schoolConfig.address || 'Tamale, Northern Region',
    phone:   schoolConfig.phone   || '+233 20 000 0000',
    email:   schoolConfig.email   || '',
  }

  const classes = await getFilteredClasses({ classIds, levelIds, academicYear })
  if (classes.length === 0) {
    txt(doc, 'No classes match the selected filters.', M, 40, { size: 10, color: RED })
    const blob = doc.output('blob')
    window.open(URL.createObjectURL(blob), '_blank')
    return
  }

  const rows = []

  if (tableType === 'student') {
    for (const cls of classes) {
      const levelName = cls.name.replace(/\s*[A-Za-z]$/, '').trim()
      const { total: expectedPerStudent, hasSchedule } = await getExpectedPerStudentForLevel(levelName, academicYear, dateTo)
      const students = await getStudentsOfClass(cls.id)
      for (const student of students) {
        const collected = await getStudentPayments(student.id, academicYear, dateFrom, dateTo)
        const expected = hasSchedule ? expectedPerStudent : 0
        const outstanding = expected - collected
        const rate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 1000) / 10) : 0
        const status = outstanding <= 0 ? 'À jour' : 'En retard'

        rows.push({
          type: 'student',
          className: cls.name,
          studentName: `${student.first_name} ${student.last_name}`,
          status,
          expected,
          collected,
          outstanding,
          rate,
          hasSchedule,
        })
      }
    }
  } else {
    for (const cls of classes) {
      const levelName = cls.name.replace(/\s*[A-Za-z]$/, '').trim()
      const students = await getStudentsOfClass(cls.id)
      const studentCount = students.length
      const studentIds = students.map(s => s.id)

      const { total: expectedPerStudent, hasSchedule } = await getExpectedPerStudentForLevel(levelName, academicYear, dateTo)
      const expected = hasSchedule ? expectedPerStudent * studentCount : 0
      const collected = await getTotalPaymentsForStudents(studentIds, academicYear, dateFrom, dateTo)
      const outstanding = expected - collected
      const rate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 1000) / 10) : 0

      rows.push({
        type: 'class',
        className: cls.name,
        students: studentCount,
        expected,
        collected,
        outstanding,
        rate,
        hasSchedule,
      })
    }
  }

  const scheduledRows = rows.filter(r => r.hasSchedule)
  const totalExpected = scheduledRows.reduce((s, r) => s + r.expected, 0)
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0)
  const totalOutstanding = totalExpected - totalCollected
  const overallRate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 1000) / 10) : 0

  // ═════════════════════════════════════════════════════════════════════════
  // DESSIN DU PDF (identique à la version précédente, non modifié)
  // ═════════════════════════════════════════════════════════════════════════
  let y = 0

  fillRect(doc, 0, 0, A4_W, 28, BLUE)
  txt(doc, school.name, M + 20, 10, { size: 12, style: 'bold', color: WHITE })
  txt(doc, school.address + (school.phone ? `  |  Tel: ${school.phone}` : ''), M + 20, 17, { size: 7.5, color: [190, 215, 245] })
  txt(doc, 'FEES COLLECTION REPORT', A4_W - M, 25, { size: 10, style: 'bold', color: GOLD, align: 'right' })
  y = 32

  const periodLabel = `${dateFrom.toLocaleDateString('en-GB')} – ${dateTo.toLocaleDateString('en-GB')}`
  txt(doc, `Period: ${periodLabel}  |  Academic Year ${academicYear}`, M, y, { size: 9, style: 'bold', color: BLACK })
  y += 10

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

    if (tableType === 'student') {
    // Colonnes : Status | Student | Class | Expected | Collected | Outstanding | Rate %
    const colX = [
      M,                     // Status
      M + 14,                // Student
      M + 14 + 40,           // Class
      M + 14 + 40 + 24,      // Expected
      M + 14 + 40 + 24 + 26, // Collected
      M + 14 + 40 + 24 + 26 + 26, // Outstanding
      M + 14 + 40 + 24 + 26 + 26 + 26 // Rate
    ]
    const colW = [14, 40, 24, 26, 26, 26, 26]
    const headers = ['Status', 'Student', 'Class', 'Expected', 'Collected', 'Outstanding', 'Rate %']

    fillRect(doc, M, y, CW, 7, BLUE)
    headers.forEach((h, i) => {
      txt(doc, h, i >= 3 ? colX[i] + colW[i] - 1 : colX[i] + 2, y + 5, {
        size: 7, style: 'bold', color: WHITE, align: i >= 3 ? 'right' : 'left'
      })
    })
    y += 7

    rows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? WHITE : [250, 250, 252]
      fillRect(doc, M, y, CW, 6, bg)
      strokeRect(doc, M, y, CW, 6, MGRAY)

      txt(doc, r.status,              colX[0] + 2, y + 4, { size: 7, color: r.status === 'À jour' ? GREEN : RED })
      txt(doc, r.studentName,         colX[1] + 2, y + 4, { size: 7, color: BLACK })
      txt(doc, r.className,           colX[2] + 2, y + 4, { size: 7, color: BLACK })
      txt(doc, r.hasSchedule ? fmtGHS(r.expected) : 'N/A', colX[3] + colW[3] - 1, y + 4, { size: 7, color: r.hasSchedule ? BLACK : DGRAY, align: 'right' })
      txt(doc, fmtGHS(r.collected),   colX[4] + colW[4] - 1, y + 4, { size: 7, color: r.collected > 0 ? GREEN : DGRAY, align: 'right' })
      if (r.outstanding > 0) {
        txt(doc, fmtGHS(r.outstanding), colX[5] + colW[5] - 1, y + 4, { size: 7, color: RED, align: 'right' })
      } else if (r.outstanding < 0) {
        txt(doc, fmtGHS(0),              colX[5] + colW[5] - 1, y + 4, { size: 7, color: DGRAY, align: 'right' })
      } else {
        txt(doc, fmtGHS(0),              colX[5] + colW[5] - 1, y + 4, { size: 7, color: DGRAY, align: 'right' })
      }
      txt(doc, r.hasSchedule ? `${r.rate.toFixed(1)}%` : 'N/A', colX[6] + colW[6] - 1, y + 4, { size: 7, style: 'bold', color: r.rate >= 100 ? GREEN : (r.rate >= 50 ? AMBER : RED), align: 'right' })
      y += 6
    })
  } else {
    // Tableau par classe
    const colX = [
      M,                     // Class
      M + 40,                // Students
      M + 40 + 20,           // Expected
      M + 40 + 20 + 30,      // Collected
      M + 40 + 20 + 30 + 30, // Outstanding
      M + 40 + 20 + 30 + 30 + 30 // Rate
    ]
    const colW = [40, 20, 30, 30, 30, 30]
    const headers = ['Class', 'Students', 'Expected', 'Collected', 'Outstanding', 'Rate %']

    fillRect(doc, M, y, CW, 7, BLUE)
    headers.forEach((h, i) => {
      txt(doc, h, i >= 2 ? colX[i] + colW[i] - 1 : colX[i] + 2, y + 5, {
        size: 7, style: 'bold', color: WHITE, align: i >= 2 ? 'right' : 'left'
      })
    })
    y += 7

    rows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? WHITE : [250, 250, 252]
      fillRect(doc, M, y, CW, 6, bg)
      strokeRect(doc, M, y, CW, 6, MGRAY)

      txt(doc, r.className,             colX[0] + 2, y + 4, { size: 7, color: BLACK })
      txt(doc, String(r.students),      colX[1] + 2, y + 4, { size: 7, color: BLACK })
      txt(doc, r.hasSchedule ? fmtGHS(r.expected) : 'N/A', colX[2] + colW[2] - 1, y + 4, { size: 7, color: r.hasSchedule ? BLACK : DGRAY, align: 'right' })
      txt(doc, fmtGHS(r.collected),     colX[3] + colW[3] - 1, y + 4, { size: 7, color: r.collected > 0 ? GREEN : DGRAY, align: 'right' })
      if (r.outstanding > 0) {
        txt(doc, fmtGHS(r.outstanding), colX[4] + colW[4] - 1, y + 4, { size: 7, color: RED, align: 'right' })
      } else if (r.outstanding < 0) {
        txt(doc, fmtGHS(0),              colX[4] + colW[4] - 1, y + 4, { size: 7, color: DGRAY, align: 'right' })
      } else {
        txt(doc, fmtGHS(0),              colX[4] + colW[4] - 1, y + 4, { size: 7, color: DGRAY, align: 'right' })
      }
      txt(doc, r.hasSchedule ? `${r.rate.toFixed(1)}%` : 'N/A', colX[5] + colW[5] - 1, y + 4, { size: 7, style: 'bold', color: r.rate >= 100 ? GREEN : (r.rate >= 50 ? AMBER : RED), align: 'right' })
      y += 6
    })
  }

    // Ligne TOTAL
  hline(doc, y, BLUE, 0.5)
  y += 2
  fillRect(doc, M, y, CW, 8, BLUE_LT)
  strokeRect(doc, M, y, CW, 8, BLUE, 0.5)

  if (tableType === 'student') {
    // Positions alignées sur les colonnes du tableau étudiant
    txt(doc, 'TOTAL', M + 2, y + 5, { size: 8, style: 'bold', color: BLUE })
    txt(doc, String(rows.length), M + 14 + 20, y + 5, { size: 8, style: 'bold', color: BLUE }) // centré approximatif
    txt(doc, totalExpected > 0 ? fmtGHS(totalExpected) : 'N/A', M + 14 + 40 + 24 + 26 - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
    txt(doc, fmtGHS(totalCollected), M + 14 + 40 + 24 + 26 + 26 - 1, y + 5, { size: 8, style: 'bold', color: GREEN, align: 'right' })
    txt(doc, totalOutstanding > 0 ? fmtGHS(totalOutstanding) : (totalOutstanding < 0 ? 'Over ' + fmtGHS(-totalOutstanding) : fmtGHS(0)),
         M + 14 + 40 + 24 + 26 + 26 + 26 - 1, y + 5, { size: 8, style: 'bold', color: totalOutstanding > 0 ? RED : (totalOutstanding < 0 ? GREEN : DGRAY), align: 'right' })
    txt(doc, totalExpected > 0 ? `${overallRate.toFixed(1)}%` : 'N/A',
         M + 14 + 40 + 24 + 26 + 26 + 26 + 26 - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
  } else {
    // Positions alignées sur les colonnes du tableau classe
    txt(doc, 'TOTAL', M + 2, y + 5, { size: 8, style: 'bold', color: BLUE })
    txt(doc, String(rows.reduce((s, r) => s + (r.students || 0), 0)), M + 40 + 2, y + 5, { size: 8, style: 'bold', color: BLUE })
    txt(doc, totalExpected > 0 ? fmtGHS(totalExpected) : 'N/A', M + 40 + 20 + 30 - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
    txt(doc, fmtGHS(totalCollected), M + 40 + 20 + 30 + 30 - 1, y + 5, { size: 8, style: 'bold', color: GREEN, align: 'right' })
    txt(doc, totalOutstanding > 0 ? fmtGHS(totalOutstanding) : (totalOutstanding < 0 ? 'Over ' + fmtGHS(-totalOutstanding) : fmtGHS(0)),
         M + 40 + 20 + 30 + 30 + 30 - 1, y + 5, { size: 8, style: 'bold', color: totalOutstanding > 0 ? RED : (totalOutstanding < 0 ? GREEN : DGRAY), align: 'right' })
    txt(doc, totalExpected > 0 ? `${overallRate.toFixed(1)}%` : 'N/A',
         M + 40 + 20 + 30 + 30 + 30 + 30 - 1, y + 5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
  }
  y += 12

  fillRect(doc, 0, A4_H - 9, A4_W, 9, BLUE)
  txt(doc, `Generated on ${new Date().toLocaleDateString('en-GB')} — ${school.name} — EduManage GH`,
    A4_W / 2, A4_H - 3.5, { size: 6.5, color: [180, 210, 245], align: 'center' })

  const blob = doc.output('blob')
  const url  = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    doc.save(`Fees-Report-${academicYear}.pdf`)
  }
}