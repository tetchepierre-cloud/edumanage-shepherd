// src/lib/receiptGenerator.js
// Génère un reçu de paiement PDF A5 directement dans le navigateur
// Utilise jsPDF installé localement (npm install jspdf)
// Format N° reçu : PAYAAAANNNNmmm ex: PAY20260001JAN

import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

// ── Constantes de mise en page A5 ────────────────────────────────────────────
const A5_W = 148   // mm
const A5_H = 210   // mm
const M    = 10    // marge gauche/droite
const CW   = A5_W - M * 2  // largeur contenu

// ── Couleurs ─────────────────────────────────────────────────────────────────
const BLUE   = [30, 77, 145]
const LGRAY  = [245, 247, 250]
const DGRAY  = [107, 114, 128]
const BLACK  = [17, 24, 39]
const GREEN  = [22, 101, 52]
const GBG    = [220, 252, 231]
const AMBER  = [146, 64, 14]
const ABGC   = [254, 243, 199]
const WHITE  = [255, 255, 255]

// ── Helper : rectangle avec fond ─────────────────────────────────────────────
function fillRect(doc, x, y, w, h, color) {
  doc.setFillColor(...color)
  doc.rect(x, y, w, h, 'F')
}

// ── Helper : texte avec couleur ───────────────────────────────────────────────
function text(doc, str, x, y, opts = {}) {
  doc.setTextColor(...(opts.color || BLACK))
  doc.setFontSize(opts.size || 9)
  doc.setFont('helvetica', opts.style || 'normal')
  doc.text(String(str), x, y, { align: opts.align || 'left', maxWidth: opts.maxWidth })
}

// ── Helper : ligne horizontale ────────────────────────────────────────────────
function line(doc, y, color = [220, 220, 220]) {
  doc.setDrawColor(...color)
  doc.setLineWidth(0.2)
  doc.line(M, y, A5_W - M, y)
}

// ── Formater les mois ─────────────────────────────────────────────────────────
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

// ── Formater montant ──────────────────────────────────────────────────────────
function fmtGHS(n) {
  return 'GHS ' + parseFloat(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })
}

// ── Formater date ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' — ' + dt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
}

// ── Générer N° reçu auto‑incrémenté depuis la base (corrigé) ─────────────────
export async function generateReceiptNumber() {
  const { data, error } = await supabase.rpc('next_receipt_number')
  if (error) throw error
  return data
}

// ════════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════
export async function printReceipt(payment, schoolConfig = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })

  const school = {
    name:    schoolConfig.school_name    || 'BRIGHT FUTURE SCHOOL',
    address: schoolConfig.address        || 'Tamale, Northern Region',
    phone:   schoolConfig.phone          || '+233 20 000 0000',
    email:   schoolConfig.email          || '',
    logo:    schoolConfig.logo           || null,   // URL ou base64
  }

  const student     = payment.students || {}
  const className   = student.classes?.name || student.class_name || '—'
  const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—'
  const receiptNo = payment.receipt_number
  const payDate     = fmtDate(payment.created_at)
  const term        = payment.term        || '—'
  const year        = payment.academic_year || '—'
  const method      = payment.payment_method || 'Cash'
  const status      = payment.status        || 'paid'
  const notes       = payment.notes         || ''

  // Prépare les lignes de frais (multi‑frais si fourni)
  let feeItems = []
  if (Array.isArray(payment.feeItems) && payment.feeItems.length > 0) {
    feeItems = payment.feeItems.map(item => ({
      description: item.description,
      expected:    parseFloat(item.expected || 0),
      paid:        parseFloat(item.paid || 0),
    }))
  } else {
    // Fallback : une seule ligne avec le montant payé
    feeItems = [{
      description: payment.payment_type + ' — ' + term + ' (' + year + ')',
      expected:    parseFloat(payment.amount || 0),
      paid:        parseFloat(payment.amount || 0),
    }]
  }

  const totalExpected = feeItems.reduce((s, i) => s + i.expected, 0)
  const totalPaid     = feeItems.reduce((s, i) => s + i.paid, 0)
  const balance       = totalExpected - totalPaid

  let y = 0

  // ── 1. HEADER BLEU ───────────────────────────────────────────────────────
  fillRect(doc, 0, 0, A5_W, 32, BLUE)

  // Logo
  if (school.logo) {
    try {
      doc.addImage(school.logo, 'PNG', M, 5, 16, 16)
    } catch (_) {
      doc.setDrawColor(...WHITE)
      doc.setLineWidth(0.3)
      doc.roundedRect(M, 5, 16, 16, 2, 2, 'S')
      text(doc, '🏫', M + 8, 15, { size: 14, color: WHITE, align: 'center' })
    }
  } else {
    doc.setDrawColor(...WHITE)
    doc.setLineWidth(0.3)
    doc.roundedRect(M, 5, 16, 16, 2, 2, 'S')
    text(doc, '🏫', M + 8, 15, { size: 14, color: WHITE, align: 'center' })
  }

  // Nom école
  text(doc, school.name.toUpperCase(), M + 22, 11, { size: 11, style: 'bold', color: WHITE })
  text(doc, school.address, M + 22, 16, { size: 8, color: [180, 210, 245] })
  if (school.phone) text(doc, 'Tel: ' + school.phone, M + 22, 21, { size: 8, color: [180, 210, 245] })
  if (school.email) text(doc, school.email, M + 22, 26, { size: 7, color: [180, 210, 245] })

  // Titre RECEIPT
  text(doc, 'OFFICIAL PAYMENT RECEIPT', A5_W - M, 28, { size: 8, style: 'bold', color: [255, 215, 0], align: 'right' })

  y = 36

  // ── 2. BANDE N° REÇU ────────────────────────────────────────────────────
  fillRect(doc, 0, y, A5_W, 9, [214, 228, 247])
  text(doc, 'Receipt No.:', M, y + 6, { size: 8, style: 'bold', color: BLUE })
  text(doc, receiptNo, M + 22, y + 6, { size: 9, style: 'bold', color: BLUE })
  text(doc, 'Date: ' + payDate, A5_W - M, y + 6, { size: 7.5, color: BLACK, align: 'right' })
  y += 13

  // ── 3. INFOS ÉLÈVE ───────────────────────────────────────────────────────
  fillRect(doc, M, y, CW, 28, LGRAY)
  doc.setDrawColor(200, 210, 225)
  doc.setLineWidth(0.2)
  doc.rect(M, y, CW, 28, 'S')

  const col2 = M + CW / 2 + 2
  const infoItems = [
    ['Student',       studentName,  'Academic Year', year],
    ['Student ID',    payment.student_id?.slice(0,8)?.toUpperCase() || '—', 'Term', term],
    ['Class',         className,    'Payment Method', method],
  ]

  let iy = y + 6
  infoItems.forEach(([l1, v1, l2, v2]) => {
    text(doc, l1 + ':', M + 2, iy, { size: 7.5, style: 'bold', color: DGRAY })
    text(doc, v1, M + 22, iy, { size: 8, color: BLACK })
    text(doc, l2 + ':', col2, iy, { size: 7.5, style: 'bold', color: DGRAY })
    text(doc, v2, col2 + 22, iy, { size: 8, color: BLACK })
    iy += 8
  })
  y += 32

  // ── 4. TABLEAU DÉTAIL DES FRAIS (multi‑frais) ────────────────────────────
  // En-tête tableau
  fillRect(doc, M, y, CW, 7, BLUE)
  text(doc, 'Description', M + 2, y + 5, { size: 8, style: 'bold', color: WHITE })
  text(doc, 'Expected', A5_W - M - 32, y + 5, { size: 8, style: 'bold', color: WHITE, align: 'right' })
  text(doc, 'Paid', A5_W - M - 2, y + 5, { size: 8, style: 'bold', color: WHITE, align: 'right' })
  y += 7

  // Lignes des frais
  feeItems.forEach((item, idx) => {
    const bgColor = idx % 2 === 0 ? WHITE : [250, 250, 252]
    fillRect(doc, M, y, CW, 7, bgColor)
    doc.setDrawColor(230, 230, 235)
    doc.rect(M, y, CW, 7, 'S')
    text(doc, item.description, M + 2, y + 5, { size: 8, color: BLACK })
    text(doc, fmtGHS(item.expected), A5_W - M - 32, y + 5, { size: 8, color: BLACK, align: 'right' })
    text(doc, fmtGHS(item.paid), A5_W - M - 2, y + 5, { size: 8, style: 'bold', color: BLACK, align: 'right' })
    y += 7
  })

  // Ligne TOTAL
  const totBg = status === 'paid' ? GBG : (status === 'partial' ? ABGC : [254, 226, 226])
  const totColor = status === 'paid' ? GREEN : (status === 'partial' ? AMBER : [153, 27, 27])
  fillRect(doc, M, y, CW, 9, totBg)
  doc.setDrawColor(...totColor)
  doc.rect(M, y, CW, 9, 'S')
  text(doc, 'TOTAL', M + 2, y + 6.5, { size: 9, style: 'bold', color: totColor })
  text(doc, fmtGHS(totalExpected), A5_W - M - 32, y + 6.5, { size: 9, style: 'bold', color: totColor, align: 'right' })
  text(doc, fmtGHS(totalPaid), A5_W - M - 2, y + 6.5, { size: 10, style: 'bold', color: totColor, align: 'right' })
  y += 13

    // ── 5. STATUT + BALANCE ──────────────────────────────────────────────────
  const statusBg   = status === 'paid' ? GBG : (status === 'partial' ? ABGC : [254, 226, 226])
  const statusCol  = status === 'paid' ? GREEN : (status === 'partial' ? AMBER : [153, 27, 27])
  const statusText = status === 'paid' ? 'FULLY PAID' : status === 'partial' ? 'PARTIAL PAYMENT' : 'PENDING'

  fillRect(doc, M, y, CW, 10, statusBg)
  doc.setDrawColor(...statusCol)
  doc.rect(M, y, CW, 10, 'S')

  text(doc, statusText, M + 2, y + 7, { size: 9, style: 'bold', color: statusCol })
  const balanceDue = totalExpected - totalPaid
  if (balanceDue > 0) {
    text(doc, 'Balance due: ' + fmtGHS(balanceDue), A5_W - M - 2, y + 7, { size: 8, style: 'bold', color: AMBER, align: 'right' })
  } else {
    text(doc, 'Balance due: GHS 0.00', A5_W - M - 2, y + 7, { size: 8, color: GREEN, align: 'right' })
  }
  y += 14

  // ── 6. NOTES ─────────────────────────────────────────────────────────────
  if (notes) {
    text(doc, 'Note: ' + notes, M, y, { size: 7.5, color: DGRAY, maxWidth: CW })
    y += 7
  }

  // ── 7. SIGNATURE ─────────────────────────────────────────────────────────
  y = Math.max(y, A5_H - 38)
  line(doc, y, [200, 210, 230])
  y += 5

  // Collecté par
  text(doc, 'Received by:', M, y, { size: 7.5, style: 'bold', color: DGRAY })
  text(doc, payment.collected_by_name || '________________', M, y + 7, { size: 8, color: BLACK })

  // Signature
  const sigX = A5_W - M - 50
  text(doc, 'Signature / Stamp:', sigX, y, { size: 7.5, style: 'bold', color: DGRAY })
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(0.3)
  doc.line(sigX, y + 10, A5_W - M, y + 10)
  y += 16

  // ── 8. PIED DE PAGE ──────────────────────────────────────────────────────
  fillRect(doc, 0, A5_H - 10, A5_W, 10, BLUE)
  text(doc, 'Computer-generated receipt — valid without stamp.  SMS confirmation sent to parent.',
    A5_W / 2, A5_H - 4, { size: 6.5, color: [180, 210, 245], align: 'center' })

  // ── IMPRESSION DIRECTE (ouverture dans nouvel onglet) ─────────────────────
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print()
    }
  } else {
    // Fallback : téléchargement forcé
    doc.save(`Receipt-${receiptNo}.pdf`)
  }
}