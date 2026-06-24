// src/lib/discountReportGenerator.js
import { jsPDF } from 'jspdf'
import { supabase } from './supabase'
import { sortClasses } from './classOrder'   // ← tri institutionnel

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
  const safeConfig = schoolConfig || {}
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  const school = {
    name:    (safeConfig.school_name || 'BRIGHT FUTURE SCHOOL').toUpperCase(),
    address: safeConfig.address || 'Tamale, Northern Region',
    phone:   safeConfig.phone   || '+233 20 000 0000',
  }

  // Appel à la vue SQL
  let query = supabase
    .from('view_student_fee_discounts')
    .select('*')
    .eq('academic_year', academicYear)

  if (term) {
    query = query.eq('term', term)
  }

  const { data: discounts, error } = await query

  if (error || !discounts?.length) {
    alert(error ? `Database Error: ${error.message}` : `No discounts found for the academic year ${academicYear}${term ? ` and ${term}` : ''}.`);
    return
  }

  // Mapping à plat et sécurisé depuis la vue
  const rows = discounts.map(d => {
    const origAmt = parseFloat(d.original_amount || 0)
    const discVal = parseFloat(d.discount_value || 0)
    
    let discAmt = 0
    if (d.discount_type === 'percentage') {
      discAmt = parseFloat((origAmt * (1 - discVal / 100)).toFixed(2))
    } else {
      discAmt = Math.max(0, origAmt - discVal)
    }

    return {
      studentName: `${d.student_first_name || ''} ${d.student_last_name || ''}`.trim(),
      className: d.class_name || '—',
      feeName: d.fee_name || '—',
      term: d.term || '—',
      discountType: d.discount_type === 'percentage' ? `${discVal}%` : `Fixed GHS ${discVal}`,
      originalAmount: origAmt,
      discountedAmount: discAmt
    }
  })

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

  const colW = [34, 22, 24, 16, 24, 24, 28]
  const colX = [M, M+colW[0], M+colW[0]+colW[1], M+colW[0]+colW[1]+colW[2], M+colW[0]+colW[1]+colW[2]+colW[3], M+colW[0]+colW[1]+colW[2]+colW[3]+colW[4], M+colW[0]+colW[1]+colW[2]+colW[3]+colW[4]+colW[5]]
  const headers = ['Student', 'Class', 'Fee', 'Term', 'Discount', 'Original', 'After Disc.']

  function drawTableHeader(yPos) {
    fillRect(doc, M, yPos, CW, 7, BLUE)
    headers.forEach((h, i) => {
      txt(doc, h, i>=4 ? colX[i]+colW[i]-1 : colX[i]+2, yPos+5, { size:7, style:'bold', color:WHITE, align: i>=4?'right':'left' })
    })
  }

  const termsOrder = ['Term 1', 'Term 2', 'Term 3']

  // Regroupement Term → Classe → lignes
  const grouped = {}
  rows.forEach(r => {
    if (!grouped[r.term]) grouped[r.term] = {}
    if (!grouped[r.term][r.className]) grouped[r.term][r.className] = []
    grouped[r.term][r.className].push(r)
  })

  let grandTotalOriginal = 0
  let grandTotalDiscounted = 0
  let grandCount = 0

  termsOrder.forEach((currentTerm, termIndex) => {
    const termGroup = grouped[currentTerm]
    if (!termGroup) return

    // Titre du terme
    if (termIndex > 0) y += 5
    txt(doc, currentTerm, M, y, { size: 11, style: 'bold', color: BLUE })
    y += 8

    // Classes triées selon l'ordre institutionnel
    const classes = sortClasses(Object.keys(termGroup).map(name => ({ name }))).map(c => c.name)
    let termTotalOriginal = 0
    let termTotalDiscounted = 0
    let termCount = 0

    classes.forEach((cls, clsIdx) => {
      if (clsIdx > 0) y += 3   // petit espace entre classes

      // Nom de la classe (sous-titre)
      txt(doc, cls, M, y, { size: 9, style: 'bold', color: DGRAY })
      y += 6

      // En-tête du tableau pour cette classe
      drawTableHeader(y)
      y += 7

      let classTotalOriginal = 0
      let classTotalDiscounted = 0
      let classCount = 0

      termGroup[cls].forEach((r, idx) => {
        if (y + 7 > A4_H - 25) {
          doc.addPage()
          y = 20
          // Rappel du terme et de la classe sur la nouvelle page
          txt(doc, currentTerm + ' – ' + cls, M, y, { size: 9, style: 'bold', color: BLUE })
          y += 8
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

        classTotalOriginal += r.originalAmount
        classTotalDiscounted += r.discountedAmount
        classCount++
      })

      // Sous-total de la classe
      if (classCount > 0) {
        hline(doc, y, MGRAY, 0.5)
        y += 2
        txt(doc, `Subtotal – ${cls} (${classCount} discount(s))`, M+2, y+4, { size:7, style:'bold', color: BLUE })
        txt(doc, fmtGHS(classTotalOriginal), colX[5]+colW[5]-1, y+4, { size:7, style:'bold', color: BLUE, align:'right' })
        txt(doc, fmtGHS(classTotalDiscounted), colX[6]+colW[6]-1, y+4, { size:7, style:'bold', color: GREEN, align:'right' })
        y += 6
      }

      termTotalOriginal += classTotalOriginal
      termTotalDiscounted += classTotalDiscounted
      termCount += classCount
    })

    // Total du terme
    hline(doc, y, BLUE, 0.8)
    y += 2
    fillRect(doc, M, y, CW, 8, BLUE_LT)
    strokeRect(doc, M, y, CW, 8, BLUE, 0.5)
    txt(doc, `TOTAL – ${currentTerm} (${termCount} discount(s))`, M+2, y+5, { size:8, style:'bold', color:BLUE })
    txt(doc, fmtGHS(termTotalOriginal), colX[5]+colW[5]-1, y+5, { size:8, style:'bold', color:BLUE, align:'right' })
    txt(doc, fmtGHS(termTotalDiscounted), colX[6]+colW[6]-1, y+5, { size:8, style:'bold', color:GREEN, align:'right' })
    y += 10

    grandTotalOriginal += termTotalOriginal
    grandTotalDiscounted += termTotalDiscounted
    grandCount += termCount
  })

  // Grand total final (tous les termes)
  hline(doc, y, BLUE, 1)
  y += 2
  fillRect(doc, M, y, CW, 10, BLUE_LT)
  strokeRect(doc, M, y, CW, 10, BLUE, 1)
  txt(doc, `GRAND TOTAL (${grandCount} discounts)`, M+2, y+6, { size:9, style:'bold', color:BLUE })
  txt(doc, fmtGHS(grandTotalOriginal), colX[5]+colW[5]-1, y+6, { size:9, style:'bold', color:BLUE, align:'right' })
  txt(doc, fmtGHS(grandTotalDiscounted), colX[6]+colW[6]-1, y+6, { size:9, style:'bold', color:GREEN, align:'right' })
  y += 14

  fillRect(doc, 0, A4_H - 9, A4_W, 9, BLUE)
  txt(doc, `Generated on ${new Date().toLocaleDateString('en-GB')} — ${school.name} — EduManage`,
    A4_W / 2, A4_H - 3.5, { size: 6.5, color: [180, 210, 245], align: 'center' })

  // Ouverture dans un nouvel onglet (pas de téléchargement)
  window.open(URL.createObjectURL(doc.output('blob')), '_blank')
}