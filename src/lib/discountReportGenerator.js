// src/lib/discountReportGenerator.js
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

const A4_W = 210, A4_H = 297, M = 12, CW = A4_W - M * 2

const BLUE    = [30, 77, 145], BLUE_LT = [214, 228, 247], LGRAY   = [245, 247, 250]
const MGRAY   = [226, 232, 240], DGRAY   = [107, 114, 128], BLACK   = [17, 24, 39]
const GREEN   = [22, 101, 52],  RED     = [153, 27, 27], WHITE   = [255, 255, 255]
const GOLD    = [255, 215, 0]

function fillRect(doc, x, y, w, h, color) { doc.setFillColor(...color); doc.rect(x, y, w, h, 'F') }
function strokeRect(doc, x, y, w, h, color, lw = 0.2) { doc.setDrawColor(...color); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S') }
function txt(doc, str, x, y, opts = {}) { doc.setTextColor(...(opts.color || BLACK)); doc.setFontSize(opts.size || 8); doc.setFont('helvetica', opts.style || 'normal'); doc.text(String(str ?? ''), x, y, { align: opts.align || 'left', maxWidth: opts.maxWidth }) }
function hline(doc, y, color = MGRAY, lw = 0.2) { doc.setDrawColor(...color); doc.setLineWidth(lw); doc.line(M, y, A4_W - M, y) }
function fmtGHS(n) { return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 }) }

export async function generateDiscountReport({
  academicYear = '2025/2026',
  schoolConfig = {},
  term = null,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  const school = {
    name:    (schoolConfig.school_name || 'BRIGHT FUTURE SCHOOL').toUpperCase(),
    address: schoolConfig.address || 'Tamale, Northern Region',
    phone:   schoolConfig.phone   || '+233 20 000 0000',
  }

  let query = supabase
    .from('student_fee_discounts')
    .select(`
      discount_type, discount_value, created_at,
      students!inner(first_name, last_name, class_id, classes!inner(name)),
      fee_structure!inner(fee_name, fee_type, amount, term, academic_year)
    `)
    .eq('fee_structure.academic_year', academicYear)

  if (term) {
    query = query.eq('fee_structure.term', term)
  }

  const { data: discounts, error } = await query.order('created_at', { ascending: false })

  if (error || !discounts?.length) {
    txt(doc, 'No discounts found for the selected period.', M, 40, { size: 10, color: RED })
    window.open(URL.createObjectURL(doc.output('blob')), '_blank')
    return
  }

  // Construire les lignes avec le terme
  const rows = discounts.map(d => ({
    studentName: `${d.students.first_name} ${d.students.last_name}`,
    className: d.students.classes?.name || '—',
    feeName: d.fee_structure.fee_name,
    term: d.fee_structure.term || '—',
    discountType: d.discount_type === 'percentage' ? `${d.discount_value}%` : `Fixed GHS ${d.discount_value}`,
    originalAmount: parseFloat(d.fee_structure.amount),
    discountedAmount: d.discount_type === 'percentage'
      ? parseFloat((d.fee_structure.amount * (1 - d.discount_value / 100)).toFixed(2))
      : Math.max(0, parseFloat(d.fee_structure.amount) - parseFloat(d.discount_value)),
    date: new Date(d.created_at).toLocaleDateString('en-GB'),
  }))

  // Trier par terme pour le regroupement
  rows.sort((a, b) => a.term.localeCompare(b.term) || a.studentName.localeCompare(b.studentName))

  let y = 0
  fillRect(doc, 0, 0, A4_W, 28, BLUE)
  txt(doc, school.name, M + 20, 10, { size: 12, style: 'bold', color: WHITE })
  txt(doc, school.address + (school.phone ? `  |  Tel: ${school.phone}` : ''), M + 20, 17, { size: 7.5, color: [190, 215, 245] })
  const title = term ? `DISCOUNT REPORT — ${term}` : 'DISCOUNT REPORT'
  txt(doc, title, A4_W - M, 25, { size: 10, style: 'bold', color: GOLD, align: 'right' })
  y = 32

  let infoLine = `Academic Year: ${academicYear}`
  if (term) infoLine += `  |  ${term}`
  txt(doc, infoLine, M, y, { size: 9, style: 'bold', color: BLACK })
  y += 10

  // Tableau : Student | Class | Fee | Term | Discount | Original | After Discount
  const colW = [34, 22, 24, 16, 24, 24, 28]
  const colX = [M, M+colW[0], M+colW[0]+colW[1], M+colW[0]+colW[1]+colW[2], M+colW[0]+colW[1]+colW[2]+colW[3], M+colW[0]+colW[1]+colW[2]+colW[3]+colW[4], M+colW[0]+colW[1]+colW[2]+colW[3]+colW[4]+colW[5]]
  const headers = ['Student', 'Class', 'Fee', 'Term', 'Discount', 'Original', 'After Disc.']

  // Fonction pour dessiner l'en-tête du tableau
  function drawTableHeader(yPos) {
    fillRect(doc, M, yPos, CW, 7, BLUE)
    headers.forEach((h, i) => {
      txt(doc, h, i>=4 ? colX[i]+colW[i]-1 : colX[i]+2, yPos+5, { size:7, style:'bold', color:WHITE, align: i>=4?'right':'left' })
    })
  }

  drawTableHeader(y)
  y += 7

  // Parcourir les lignes avec regroupement par terme
  let lastTerm = null
  rows.forEach((r, idx) => {
    // Insérer un espace avant chaque nouveau groupe de terme (sauf le premier)
    if (r.term !== lastTerm && lastTerm !== null) {
      // Ligne de séparation grise
      y += 3
      fillRect(doc, M, y, CW, 0.5, MGRAY)
      y += 3
    }
    lastTerm = r.term

    // Saut de page si nécessaire
    if (y + 7 > A4_H - 25) {
      doc.addPage()
      y = 20
      drawTableHeader(y)
      y += 7
    }

    const bg = idx % 2 === 0 ? WHITE : [250,250,252]
    fillRect(doc, M, y, CW, 6, bg)
    strokeRect(doc, M, y, CW, 6, MGRAY)
    txt(doc, r.studentName,     colX[0]+2, y+4, { size:7, color: BLACK })
    txt(doc, r.className,       colX[1]+2, y+4, { size:7, color: BLACK })
    txt(doc, r.feeName,         colX[2]+2, y+4, { size:7, color: BLACK })
    txt(doc, r.term,            colX[3]+2, y+4, { size:7, color: BLACK })
    txt(doc, r.discountType,    colX[4]+colW[4]-1, y+4, { size:7, color: r.discountType.includes('%') ? RED : GREEN, align:'right' })
    txt(doc, fmtGHS(r.originalAmount), colX[5]+colW[5]-1, y+4, { size:7, color: BLACK, align:'right' })
    txt(doc, fmtGHS(r.discountedAmount), colX[6]+colW[6]-1, y+4, { size:7, style:'bold', color: GREEN, align:'right' })
    y += 6
  })

  // Ligne total
  hline(doc, y, BLUE, 0.5)
  y += 2
  fillRect(doc, M, y, CW, 8, BLUE_LT)
  strokeRect(doc, M, y, CW, 8, BLUE, 0.5)
  txt(doc, `TOTAL: ${rows.length} discount(s)`, M+2, y+5, { size:8, style:'bold', color:BLUE })
  const totalOriginal = rows.reduce((s, r) => s + r.originalAmount, 0)
  const totalDiscounted = rows.reduce((s, r) => s + r.discountedAmount, 0)
  txt(doc, fmtGHS(totalOriginal), colX[5]+colW[5]-1, y+5, { size:8, style:'bold', color:BLUE, align:'right' })
  txt(doc, fmtGHS(totalDiscounted), colX[6]+colW[6]-1, y+5, { size:8, style:'bold', color:GREEN, align:'right' })
  y += 12

  fillRect(doc, 0, A4_H - 9, A4_W, 9, BLUE)
  txt(doc, `Generated on ${new Date().toLocaleDateString('en-GB')} — ${school.name} — EduManage GH`,
    A4_W / 2, A4_H - 3.5, { size: 6.5, color: [180, 210, 245], align: 'center' })

  window.open(URL.createObjectURL(doc.output('blob')), '_blank')
}