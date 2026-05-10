// src/lib/classBalanceReportGenerator.js
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

const A4_W = 210, A4_H = 297, M = 12, CW = A4_W - M * 2

const BLUE    = [30, 77, 145]
const BLUE_LT = [214, 228, 247]
const BLACK   = [17, 24, 39]
const GREEN   = [22, 101, 52]
const RED     = [153, 27, 27]
const DGRAY   = [107, 114, 128]
const GOLD    = [255, 215, 0]
const WHITE   = [255, 255, 255]

function fillRect(doc, x, y, w, h, color) { doc.setFillColor(...color); doc.rect(x, y, w, h, 'F') }
function txt(doc, str, x, y, opts = {}) { doc.setTextColor(...(opts.color || BLACK)); doc.setFontSize(opts.size || 8); doc.setFont('helvetica', opts.style || 'normal'); doc.text(String(str ?? ''), x, y, { align: opts.align || 'left', maxWidth: opts.maxWidth }) }
function fmtGHS(n) { return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 }) }

/**
 * Calcule le total attendu pour un élève et une année académique
 */
async function getExpectedForStudent(studentId, academicYear) {
  // Récupérer le niveau de l'élève
  const { data: student } = await supabase
    .from('students')
    .select('class_id, classes(level_id)')
    .eq('id', studentId)
    .single()

  if (!student?.classes?.level_id) return 0

  const levelId = student.classes.level_id

  // Récupérer les frais actifs pour ce niveau
  const { data: fees } = await supabase
    .from('fee_structure')
    .select('id, amount')
    .eq('level_id', levelId)
    .eq('academic_year', academicYear)
    .eq('is_active', true)

  if (!fees?.length) return 0

  // Récupérer les réductions
  const { data: discounts } = await supabase
    .from('student_fee_discounts')
    .select('fee_structure_id, discount_type, discount_value')
    .eq('student_id', studentId)

  const discountMap = {}
  ;(discounts || []).forEach(d => { discountMap[d.fee_structure_id] = d })

  let total = 0
  fees.forEach(f => {
    let amount = parseFloat(f.amount)
    const disc = discountMap[f.id]
    if (disc) {
      if (disc.discount_type === 'fixed') amount = Math.max(0, amount - parseFloat(disc.discount_value))
      else amount *= (1 - parseFloat(disc.discount_value) / 100)
    }
    total += amount
  })

  // Ajouter les échéances (schedules) si elles existent, sinon on garde le total annuel
  // (simplifié : on se base sur le total annuel)
  return parseFloat(total.toFixed(2))
}

/**
 * Calcule le total payé par un élève pour une année académique
 */
async function getTotalPaidForStudent(studentId, academicYear) {
  const { data: payments } = await supabase
    .from('fee_payments')
    .select('amount')
    .eq('student_id', studentId)
    .eq('academic_year', academicYear)
    .in('status', ['paid', 'partial'])

  return (payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0)
}

/**
 * Génère le rapport de solde par classe
 */
export async function generateClassBalanceReport({ className, classId, academicYear, schoolConfig = {} }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  const school = {
    name:    (schoolConfig.school_name || 'SCHOOL NAME').toUpperCase(),
    address: schoolConfig.address || '',
    phone:   schoolConfig.phone   || '',
    email:   schoolConfig.email   || '',
    logo:    schoolConfig.logo    || null,
  }

  // Charger le logo si disponible
  let logoData = null
  if (school.logo) {
    try {
      const response = await fetch(school.logo)
      const blob = await response.blob()
      const reader = new FileReader()
      logoData = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob) })
    } catch (e) {}
  }

  // Récupérer les élèves actifs de la classe
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .eq('class_id', classId)
    .order('last_name')

  if (!students?.length) {
    txt(doc, 'No students found in this class.', M, 40, { size: 10, color: RED })
    window.open(URL.createObjectURL(doc.output('blob')), '_blank')
    return
  }

  // Calculer les soldes pour chaque élève
  const rows = []
  for (const s of students) {
    const expected = await getExpectedForStudent(s.id, academicYear)
    const paid = await getTotalPaidForStudent(s.id, academicYear)
    const balance = expected - paid
    rows.push({ name: `${s.last_name} ${s.first_name}`, expected, paid, balance })
  }

  let y = 0

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
  txt(doc, 'CLASS BALANCE REPORT', A4_W - M, 25, { size: 10, style: 'bold', color: GOLD, align: 'right' })
  y = 32

  txt(doc, `Class: ${className}    |    Academic Year: ${academicYear}    |    Students: ${students.length}`, M, y, { size: 9, style: 'bold', color: BLACK })
  y += 12

  // Tableau
  const colW = [10, 70, 30, 30, 30]
  const colX = [M, M+colW[0], M+colW[0]+colW[1], M+colW[0]+colW[1]+colW[2], M+colW[0]+colW[1]+colW[2]+colW[3]]
  const headers = ['#', 'Name', 'Expected', 'Paid', 'Balance']

  fillRect(doc, M, y, CW, 7, BLUE)
  headers.forEach((h, i) => {
    txt(doc, h, i >= 2 ? colX[i]+colW[i]-1 : colX[i]+2, y+5, { size: 7, style: 'bold', color: WHITE, align: i >= 2 ? 'right' : 'left' })
  })
  y += 7

  let totalExpected = 0, totalPaid = 0, totalBalance = 0

  rows.forEach((r, idx) => {
    if (y > A4_H - 30) {
      doc.addPage()
      y = M
      fillRect(doc, M, y, CW, 7, BLUE)
      headers.forEach((h, i) => {
        txt(doc, h, i >= 2 ? colX[i]+colW[i]-1 : colX[i]+2, y+5, { size: 7, style: 'bold', color: WHITE, align: i >= 2 ? 'right' : 'left' })
      })
      y += 7
    }

    const bg = idx % 2 === 0 ? WHITE : [250, 250, 252]
    fillRect(doc, M, y, CW, 6, bg)
    txt(doc, String(idx + 1), colX[0]+2, y+4, { size: 7, color: DGRAY })
    txt(doc, r.name, colX[1]+2, y+4, { size: 7, color: BLACK })
    txt(doc, fmtGHS(r.expected), colX[2]+colW[2]-1, y+4, { size: 7, color: BLACK, align: 'right' })
    txt(doc, fmtGHS(r.paid), colX[3]+colW[3]-1, y+4, { size: 7, color: GREEN, align: 'right' })
    txt(doc, fmtGHS(r.balance), colX[4]+colW[4]-1, y+4, { size: 7, style: 'bold', color: r.balance > 0 ? RED : GREEN, align: 'right' })
    y += 6

    totalExpected += r.expected
    totalPaid += r.paid
    totalBalance += r.balance
  })

  // Ligne total
  fillRect(doc, M, y, CW, 8, BLUE_LT)
  txt(doc, 'TOTAL', colX[0]+2, y+5, { size: 8, style: 'bold', color: BLUE })
  txt(doc, fmtGHS(totalExpected), colX[2]+colW[2]-1, y+5, { size: 8, style: 'bold', color: BLUE, align: 'right' })
  txt(doc, fmtGHS(totalPaid), colX[3]+colW[3]-1, y+5, { size: 8, style: 'bold', color: GREEN, align: 'right' })
  txt(doc, fmtGHS(totalBalance), colX[4]+colW[4]-1, y+5, { size: 8, style: 'bold', color: totalBalance > 0 ? RED : GREEN, align: 'right' })

  // Pied de page
  fillRect(doc, 0, A4_H - 9, A4_W, 9, BLUE)
  txt(doc, `Generated on ${new Date().toLocaleDateString('en-GB')} — ${school.name} — EduManage GH`,
    A4_W / 2, A4_H - 3.5, { size: 6.5, color: [180, 210, 245], align: 'center' })

  window.open(URL.createObjectURL(doc.output('blob')), '_blank')
}