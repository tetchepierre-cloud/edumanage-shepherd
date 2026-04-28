// src/lib/statementGenerator.js
// Relevé de Compte Élève — conforme à la maquette EduManage GH
// (affichage uniquement des lignes de paiement, hors échéances)

import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

// ── Mise en page A4 ──────────────────────────────────────────────────────────
const A4_W = 210
const A4_H = 297
const M    = 12
const CW   = A4_W - M * 2   // 186mm

// ── Couleurs ─────────────────────────────────────────────────────────────────
const BLUE    = [30,  77,  145]
const BLUE_LT = [214, 228, 247]
const LGRAY   = [245, 247, 250]
const MGRAY   = [226, 232, 240]
const DGRAY   = [107, 114, 128]
const BLACK   = [17,  24,  39]
const GREEN   = [22,  101, 52]
const GREEN_L = [220, 252, 231]
const AMBER   = [146, 64,  14]
const AMBER_L = [254, 243, 199]
const RED     = [153, 27,  27]
const RED_L   = [254, 226, 226]
const WHITE   = [255, 255, 255]
const GOLD    = [255, 215, 0]

// ── Primitives graphiques ────────────────────────────────────────────────────
function fillRect(doc, x, y, w, h, color) {
  doc.setFillColor(...color)
  doc.rect(x, y, w, h, 'F')
}

function strokeRect(doc, x, y, w, h, color, lw = 0.2) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.rect(x, y, w, h, 'S')
}

function hline(doc, y, x1, x2, color = MGRAY, lw = 0.2) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.line(x1, y, x2, y)
}

function txt(doc, str, x, y, opts = {}) {
  doc.setTextColor(...(opts.color || BLACK))
  doc.setFontSize(opts.size || 8)
  doc.setFont('helvetica', opts.style || 'normal')
  doc.text(String(str ?? ''), x, y, {
    align:    opts.align    || 'left',
    maxWidth: opts.maxWidth || undefined,
  })
}

// ── Formater montant ──────────────────────────────────────────────────────────
function ghs(n) {
  return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })
}

// ── Formater date courte ──────────────────────────────────────────────────────
function fmtD(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Résolution de la période ─────────────────────────────────────────────────
function resolvePeriod(academicYear, period) {
  const y0 = parseInt(academicYear.split('/')[0])
  const map = {
    T1:   { from: new Date(y0, 8, 1),     to: new Date(y0, 11, 31),    label: `Term 1 — ${academicYear}` },
    T2:   { from: new Date(y0+1, 0, 1),   to: new Date(y0+1, 3, 30),   label: `Term 2 — ${academicYear}` },
    T3:   { from: new Date(y0+1, 4, 1),   to: new Date(y0+1, 7, 31),   label: `Term 3 — ${academicYear}` },
    full: { from: new Date(y0, 8, 1),     to: new Date(y0+1, 7, 31),   label: academicYear },
  }
  return map[period] || map.full
}

// ── Structure des frais (retire le suffixe alphabétique de la classe) ───────
async function getFeeStructure(student, academicYear) {
  const className = (student.classes?.name || '').trim()
  if (!className) return { tuition: null, ancillary: [] }

  const levelName = className.replace(/\s*[A-Za-z]$/, '').trim()

  const { data: level } = await supabase
    .from('levels')
    .select('id')
    .ilike('name', levelName)
    .maybeSingle()

  if (!level) return { tuition: null, ancillary: [] }

  const { data: fees } = await supabase
    .from('fee_structure')
    .select('fee_name, fee_type, amount, is_mandatory')
    .eq('level_id', level.id)
    .eq('academic_year', academicYear)
    .eq('is_active', true)

  if (!fees?.length) return { tuition: null, ancillary: [] }

  const tuition   = fees.find(f => f.fee_type === 'tuition') || null
  const ancillary = fees.filter(f => f.fee_type !== 'tuition')
  return {
    tuition:   tuition   ? { name: tuition.fee_name, annual: parseFloat(tuition.amount) } : null,
    ancillary: ancillary.map(f => ({ name: f.fee_name, amount: parseFloat(f.amount) })),
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE — generateStudentStatement
// ════════════════════════════════════════════════════════════════════════════
export async function generateStudentStatement({
  student,
  academicYear  = '2025/2026',
  period        = 'full',
  customFrom    = null,
  customTo      = null,
  schoolConfig  = {},
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  // ── 0. Période ────────────────────────────────────────────────────────────
  let dateFrom, dateTo, periodLabel
  if (period === 'custom' && customFrom && customTo) {
    dateFrom    = new Date(customFrom)
    dateTo      = new Date(customTo)
    periodLabel = `${fmtD(customFrom)} – ${fmtD(customTo)}`
  } else {
    const r  = resolvePeriod(academicYear, period)
    dateFrom = r.from; dateTo = r.to; periodLabel = r.label
  }

  // ── 0b. Infos école ───────────────────────────────────────────────────────
  const school = {
    name:    (schoolConfig.school_name || 'BRIGHT FUTURE SCHOOL').toUpperCase(),
    address: schoolConfig.address || 'Tamale, Northern Region',
    phone:   schoolConfig.phone   || '+233 20 000 0000',
    email:   schoolConfig.email   || '',
  }
  const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim()

  // ── 0c. Structure des frais (pour le calcul du total attendu) ─────────────
  const { tuition, ancillary } = await getFeeStructure(student, academicYear)
  const annualTuition   = tuition?.annual || 0
  const monthlyTuition  = annualTuition > 0 ? parseFloat((annualTuition / 12).toFixed(2)) : 0

  // ── 0d. Paiements réels de la période ────────────────────────────────────
  const { data: payments } = await supabase
    .from('fee_payments')
    .select('*')
    .eq('student_id', student.id)
    .eq('academic_year', academicYear)
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', new Date(dateTo.getTime() + 86399999).toISOString())
    .order('created_at', { ascending: true })

  // ── 0e. Construction des lignes (uniquement les paiements) ────────────────
  const rows = []
  const seen = new Set()

  function addRow(r) {
    const key = r.date.toISOString() + '|' + r.description + '|' + r.expected + '|' + r.paid + '|' + r.type
    if (!seen.has(key)) {
      seen.add(key)
      rows.push(r)
    }
  }

  // Seules les lignes de paiement sont ajoutées
  ;(payments || []).forEach(p => {
    addRow({
      date:        new Date(p.created_at),
      description: `Payment received — ${p.payment_type} · ${p.payment_method} · ${p.receipt_number || ''}`,
      expected:    0,
      paid:        parseFloat(p.amount),
      type:        'payment',
    })
  })

  // Tri chronologique
  rows.sort((a, b) => a.date - b.date || (a.type === 'expected' ? -1 : 1))

  // ── Calcul du total attendu sur la période ───────────────────────────────
  const nbMonths =
    (dateTo.getFullYear() - dateFrom.getFullYear()) * 12 +
    (dateTo.getMonth() - dateFrom.getMonth()) + 1

  const totalTuitionExpected = monthlyTuition * nbMonths
  const totalAncillary = ancillary.reduce((s, a) => s + a.amount, 0)
  const totalExpected = parseFloat((totalTuitionExpected + totalAncillary).toFixed(2))

  const totalPaid     = parseFloat((payments || []).reduce((s, p) => s + parseFloat(p.amount), 0).toFixed(2))
  const outstanding   = parseFloat((totalExpected - totalPaid).toFixed(2))

  // ── Solde cumulatif (reste dû après chaque paiement) ──────────────────────
  let runningBalance = totalExpected
  const finalRows = rows.map(r => {
    runningBalance = parseFloat((runningBalance - r.paid).toFixed(2))
    return { ...r, balance: runningBalance }
  })

  // ═════════════════════════════════════════════════════════════════════════
  // DESSIN DU PDF
  // ═════════════════════════════════════════════════════════════════════════
  let y = 0

  // ── 1. EN-TÊTE BLEU ────────────────────────────────────────────────────
  fillRect(doc, 0, 0, A4_W, 28, BLUE)

  doc.setFillColor(...WHITE)
  doc.circle(M + 8, 14, 7, 'F')
  txt(doc, '🏫', M + 4.5, 16.5, { size: 10, color: BLUE })

  txt(doc, school.name, M + 20, 10, { size: 12, style: 'bold', color: WHITE })
  txt(doc, school.address + (school.phone ? `  |  Tel: ${school.phone}` : ''), M + 20, 17, { size: 7.5, color: [190, 215, 245] })
  if (school.email) txt(doc, school.email, M + 20, 23, { size: 7, color: [190, 215, 245] })

  txt(doc, 'STUDENT ACCOUNT STATEMENT', A4_W - M, 25, { size: 9, style: 'bold', color: GOLD, align: 'right' })
  y = 32

  // ── 2. BLOCS INFO (2 colonnes) ─────────────────────────────────────────
  const halfW = (CW / 2) - 2
  const col2X = M + halfW + 4

  fillRect(doc, M, y, halfW, 34, LGRAY)
  strokeRect(doc, M, y, halfW, 34, BLUE_LT)
  fillRect(doc, M, y, halfW, 6, BLUE_LT)
  txt(doc, 'STUDENT INFORMATION', M + 3, y + 4.5, { size: 7, style: 'bold', color: BLUE })

  let iy = y + 12
  const infos = [
    ['Name',           studentName],
    ['Student ID',     student.student_id || student.id?.slice(0,8).toUpperCase() || '—'],
    ['Class',          student.classes?.name || '—'],
    ['Academic Year',  academicYear],
  ]
  infos.forEach(([label, val]) => {
    txt(doc, label + ' :', M + 3, iy, { size: 7.5, style: 'bold', color: DGRAY })
    txt(doc, val, M + 28, iy, { size: 7.5, color: BLACK })
    iy += 7
  })

  fillRect(doc, col2X, y, halfW, 34, LGRAY)
  strokeRect(doc, col2X, y, halfW, 34, BLUE_LT)
  fillRect(doc, col2X, y, halfW, 6, BLUE_LT)
  txt(doc, 'PERIOD & FILTERS', col2X + 3, y + 4.5, { size: 7, style: 'bold', color: BLUE })

  iy = y + 12
  const periods = [
    ['Period',         periodLabel],
    ['Date from',      fmtD(dateFrom)],
    ['Date to',        fmtD(dateTo)],
    ['Generated on',   fmtD(new Date())],
  ]
  periods.forEach(([label, val]) => {
    txt(doc, label + ' :', col2X + 3, iy, { size: 7.5, style: 'bold', color: DGRAY })
    txt(doc, val, col2X + 26, iy, { size: 7.5, color: BLACK })
    iy += 7
  })
  y += 38

  // ── 3. BANDEAU 3 KPIs ──────────────────────────────────────────────────
  const kpiW  = (CW / 3) - 1.5
  const kpis  = [
    { label: 'Total Expected',     value: ghs(totalExpected), bg: BLUE_LT,  border: BLUE,  vc: BLUE  },
    { label: 'Total Paid',         value: ghs(totalPaid),     bg: GREEN_L,  border: GREEN, vc: GREEN },
    { label: 'Outstanding Balance',value: ghs(outstanding),   bg: outstanding > 0 ? AMBER_L : GREEN_L, border: outstanding > 0 ? AMBER : GREEN, vc: outstanding > 0 ? AMBER : GREEN },
  ]
  kpis.forEach((k, i) => {
    const kx = M + i * (kpiW + 2.25)
    fillRect(doc, kx, y, kpiW, 16, k.bg)
    strokeRect(doc, kx, y, kpiW, 16, k.border, 0.5)
    txt(doc, k.label, kx + kpiW / 2, y + 5.5, { size: 7, style: 'bold', color: k.vc, align: 'center' })
    txt(doc, k.value, kx + kpiW / 2, y + 12, { size: 9, style: 'bold', color: k.vc, align: 'center' })
  })
  y += 20

  // ── 4. TABLEAU DES MOUVEMENTS ─────────────────────────────────────────
  const colDate  = 24
  const colDesc  = CW - colDate - 3 * 30
  const colNum   = 30
  const cols     = [colDate, colDesc, colNum, colNum, colNum]
  const colX     = [
    M,
    M + colDate,
    M + colDate + colDesc,
    M + colDate + colDesc + colNum,
    M + colDate + colDesc + colNum * 2,
  ]
  const headers  = ['Date', 'Description', 'Expected', 'Paid', 'Balance']
  const hAligns  = ['left','left','right','right','right']

  fillRect(doc, M, y, CW, 7, BLUE)
  strokeRect(doc, M, y, CW, 7, BLUE)
  headers.forEach((h, i) => {
    txt(doc, h, hAligns[i] === 'right' ? colX[i] + cols[i] - 1 : colX[i] + 2, y + 5, {
      size: 7, style: 'bold', color: WHITE, align: hAligns[i]
    })
  })
  y += 7

  let pageRemaining = A4_H - y - 20

  finalRows.forEach((r, idx) => {
    if (pageRemaining < 7) {
      doc.addPage()
      y = 10
      fillRect(doc, M, y, CW, 7, BLUE)
      strokeRect(doc, M, y, CW, 7, BLUE)
      headers.forEach((h, i) => {
        txt(doc, h, hAligns[i] === 'right' ? colX[i] + cols[i] - 1 : colX[i] + 2, y + 5, {
          size: 7, style: 'bold', color: WHITE, align: hAligns[i]
        })
      })
      y += 7
      pageRemaining = A4_H - y - 20
    }

    const bg = idx % 2 === 0 ? WHITE : [250, 250, 252]   // fond neutre pour toutes les lignes

    fillRect(doc, M, y, CW, 6.5, bg)
    strokeRect(doc, M, y, CW, 6.5, MGRAY)

    colX.slice(1).forEach(cx => {
      doc.setDrawColor(...MGRAY)
      doc.setLineWidth(0.1)
      doc.line(cx, y, cx, y + 6.5)
    })

    // Tous les textes en noir standard (plus de vert ni de gras)
    txt(doc, fmtD(r.date), colX[0] + 2, y + 4.5, { size: 7, color: BLACK })
    txt(doc, r.description, colX[1] + 2, y + 4.5, {
      size: 7, color: BLACK,
      maxWidth: colDesc - 3,
    })
    txt(doc, r.expected > 0 ? ghs(r.expected) : '—', colX[2] + cols[2] - 1, y + 4.5, {
      size: 7, color: r.expected > 0 ? BLACK : [180, 180, 180], align: 'right'
    })
    txt(doc, r.paid > 0 ? ghs(r.paid) : '—', colX[3] + cols[3] - 1, y + 4.5, {
      size: 7, color: r.paid > 0 ? BLACK : [180, 180, 180], align: 'right'
    })

    // Balance conserve ses couleurs distinctives
    const balColor = r.balance > 0 ? RED : (r.balance < 0 ? BLUE : GREEN)
    txt(doc, ghs(r.balance), colX[4] + cols[4] - 1, y + 4.5, {
      size: 7, style: 'bold', color: balColor, align: 'right'
    })

    y += 6.5
    pageRemaining -= 6.5
  })

  // Ligne TOTAUX
  hline(doc, y, M, M + CW, BLUE, 0.5)
  y += 2
  fillRect(doc, M, y, CW, 8, BLUE_LT)
  strokeRect(doc, M, y, CW, 8, BLUE, 0.5)
  txt(doc, 'TOTALS', colX[0] + 2, y + 5.5, { size: 8, style: 'bold', color: BLUE })
  txt(doc, ghs(totalExpected), colX[2] + cols[2] - 1, y + 5.5, { size: 8, style: 'bold', color: BLUE,  align: 'right' })
  txt(doc, ghs(totalPaid),     colX[3] + cols[3] - 1, y + 5.5, { size: 8, style: 'bold', color: GREEN, align: 'right' })
  txt(doc, ghs(outstanding),   colX[4] + cols[4] - 1, y + 5.5, { size: 8, style: 'bold', color: outstanding > 0 ? RED : GREEN, align: 'right' })
  y += 12

  // ── 5. PIED DE PAGE BLEU ─────────────────────────────────────────────
  fillRect(doc, 0, A4_H - 9, A4_W, 9, BLUE)
  txt(doc, `Generated on ${fmtD(new Date())} — ${school.name} — EduManage GH`,
    A4_W / 2, A4_H - 3.5, { size: 6.5, color: [180, 210, 245], align: 'center' })

  // ── SORTIE ────────────────────────────────────────────────────────────
  const blob = doc.output('blob')
  const url  = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    doc.save(`Statement-${student.last_name || 'Student'}-${periodLabel.replace(/\//g,'-')}.pdf`)
  }
}