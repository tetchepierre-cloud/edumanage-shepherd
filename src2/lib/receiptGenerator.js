// src/lib/receiptGenerator.js
import { jsPDF, GState } from 'jspdf'
import { supabase } from './supabase'

// Dimensions A5 Paysage (Landscape) en mm
const A5_W = 210
const A5_H = 148
const M    = 12 // Marges optimales
const CW   = A5_W - (M * 2) // Largeur de contenu utile (186mm)

// Palette de couleurs professionnelle (RGB)
const BLUE   = [30, 77, 145]
const BLUE_L = [214, 228, 247]
const LGRAY  = [245, 247, 250]
const MGRAY  = [226, 232, 240]
const DGRAY  = [107, 114, 128]
const BLACK  = [17, 24, 39]
const GREEN  = [22, 101, 52]
const GBG    = [220, 252, 231]
const AMBER  = [146, 64, 14]
const WHITE  = [255, 255, 255]

// Fonctions utilitaires de dessin géométrique et textuel
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
  const size = opts.size || 9.5
  const style = opts.style || 'normal'
  const color = opts.color || BLACK
  const align = opts.align || 'left'
  const maxWidth = opts.maxWidth || null

  doc.setFont('helvetica', style)
  doc.setFontSize(size)
  doc.setTextColor(...color)

  if (maxWidth) {
    doc.text(String(str), x, y, { align: align, maxWidth: maxWidth })
  } else {
    doc.text(String(str), x, y, { align: align })
  }
}

function hline(doc, y, color = MGRAY, lw = 0.2) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.line(M, y, A5_W - M, y)
}

/**
 * Génère et télécharge le reçu officiel au format A5 Paysage
 */
export async function printReceipt(payment, schoolConfig = {}, student = {}, currentClass = {}, feeDetails = []) {
  // Initialisation du document en mode Paysage (landscape)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5'
  })

  // Dimensions adaptées pour le logo agrandi (40.5mm * 1.5 = 60.75mm)
  const hasLogo = !!schoolConfig?.logo
  const logoSize = 36.45
  const textStartX = hasLogo ? M + logoSize + 4 : M

  // Grille verticale réajustée suite au déplacement du logo vers le haut (Y=4) et son agrandissement
  const headerY = 15
  const studentBlockY = hasLogo ? 48 : 35
  const tableY = studentBlockY + 18

  // 1. FILIGRANE (Watermark) Central multiplié par 3 (132mm x 132mm)
  if (hasLogo) {
    try {
      doc.saveGraphicsState()
      const gState = new GState({ opacity: 0.04 })
      doc.setGState(gState)
      doc.addImage(schoolConfig.logo, 'PNG', (A5_W / 2) - 52.8, (A5_H / 2) - 52.8, 105.6, 105.6)
      doc.restoreGraphicsState()
    } catch (e) {
      console.warn("Watermark application failed:", e)
    }
  }

  // 2. EN-TÊTE - LOGO DE L'ÉCOLE (Positionné plus haut à Y=4)
  if (hasLogo) {
    try {
      doc.addImage(schoolConfig.logo, 'PNG', M, 4, logoSize, logoSize)
    } catch (err) {
      fillRect(doc, M, 4, logoSize, logoSize, BLUE_L)
      text(doc, '🏫', M + (logoSize / 2), 4 + (logoSize / 2) + 2, { size: 18, align: 'center' })
    }
  }

  // Coordonnées et alignement vertical de l'en-tête textuel à côté du logo
  text(doc, schoolConfig.school_name || 'Accra Excellence International School', textStartX, headerY, { size: 13, style: 'bold', color: BLUE })
  text(doc, schoolConfig.address || 'P.O. Box GA-432-1090, East Legon, Accra, Ghana', textStartX, headerY + 6, { size: 8.5, color: DGRAY })
  text(doc, `Tel: ${schoolConfig.phone || '+233 (0) 302 555 123'}`, textStartX, headerY + 11, { size: 8.5, color: DGRAY })
  text(doc, `Email: ${schoolConfig.email || 'info@school.edu.gh'}`, textStartX, headerY + 16, { size: 8.5, color: DGRAY })

  // 3. EN-TÊTE - NUMÉRO ET DATE DE REÇU (Droite)
  text(doc, 'OFFICIAL RECEIPT', A5_W - M, headerY, { size: 13, style: 'bold', color: BLUE, align: 'right' })
  
  // Petit bloc d'identification du reçu
  fillRect(doc, A5_W - M - 58, headerY + 4, 58, 12, BLUE_L)
  strokeRect(doc, A5_W - M - 58, headerY + 4, 58, 12, [185, 213, 242])
  
  const receiptNo = payment.receipt_no || payment.receipt_number || '#REC-0000'
  
  // Nettoyage et formatage strict de la date (Ex: 26 May 2026)
  let rawDate = payment.payment_date || payment.created_at || new Date().toISOString()
  let receiptDate = String(rawDate).split('T')[0] 
  if (receiptDate.includes('-')) {
    const dateParts = receiptDate.split('-')
    if (dateParts[0].length === 4) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      const day = parseInt(dateParts[2], 10)
      const monthIndex = parseInt(dateParts[1], 10) - 1
      const year = dateParts[0]
      if (monthIndex >= 0 && monthIndex < 12) {
        receiptDate = `${day} ${months[monthIndex]} ${year}`
      }
    }
  }
  
  text(doc, 'Receipt No:', A5_W - M - 55, headerY + 8.5, { size: 8, style: 'bold', color: BLUE })
  text(doc, receiptNo, A5_W - M - 3, headerY + 8.5, { size: 8, style: 'bold', color: BLACK, align: 'right' })
  text(doc, 'Date:', A5_W - M - 55, headerY + 12.5, { size: 8, style: 'bold', color: BLUE })
  text(doc, receiptDate, A5_W - M - 3, headerY + 12.5, { size: 8, color: BLACK, align: 'right' })

  // Ligne de séparation d'en-tête adaptée à la nouvelle hauteur de fin du logo (64.75mm -> ligne à 67mm)
  hline(doc, hasLogo ? 45 : 32, BLUE, 1.2)

  // 4. BLOC DES INFORMATIONS ÉLÈVE
  fillRect(doc, M, studentBlockY, CW, 15, LGRAY)
  strokeRect(doc, M, studentBlockY, CW, 15, MGRAY)

  // Extraction ciblée pour la structure relationnelle Supabase
  let rawId = payment.student_id || student?.id || 'N/A';
  const studentIdVal = rawId.length > 20 ? rawId.slice(0, 8).toUpperCase() : rawId;

  let studentNameVal = 'N/A';
  if (payment.students && payment.students.first_name) {
    studentNameVal = `${payment.students.first_name} ${payment.students.last_name || ''}`.trim();
  } else if (student?.first_name) {
    studentNameVal = `${student.first_name} ${student.last_name || ''}`.trim();
  }

  let classNameVal = 'N/A';
  if (payment.students?.classes?.name) {
    classNameVal = payment.students.classes.name;
  } else if (currentClass?.name) {
    classNameVal = currentClass.name;
  }

  const periodStr = `${payment.academic_year || '2025/2026'} — ${payment.term || 'Term 2'}`

  // Colonne 1 du bloc élève
  text(doc, 'Student ID:', M + 4, studentBlockY + 4.5, { size: 8.5, color: DGRAY, style: 'bold' })
  text(doc, studentIdVal, M + 28, studentBlockY + 4.5, { size: 8.5, color: BLACK, style: 'bold' })
  text(doc, 'Student Name:', M + 4, studentBlockY + 10.5, { size: 8.5, color: DGRAY, style: 'bold' })
  text(doc, studentNameVal, M + 28, studentBlockY + 10.5, { size: 8.5, color: BLACK, style: 'bold' })

  // Colonne 2 du bloc élève
  const col2X = M + (CW / 2) + 4
  text(doc, 'Class:', col2X, studentBlockY + 4.5, { size: 8.5, color: DGRAY, style: 'bold' })
  text(doc, classNameVal, col2X + 32, studentBlockY + 4.5, { size: 8.5, color: BLACK, style: 'bold' })
  text(doc, 'Academic Period:', col2X, studentBlockY + 10.5, { size: 8.5, color: DGRAY, style: 'bold' })
  text(doc, periodStr, col2X + 32, studentBlockY + 10.5, { size: 8.5, color: BLACK, style: 'bold' })

  // 5. TABLEAU DES FRAIS 
  fillRect(doc, M, tableY, CW, 7, BLUE)
  text(doc, 'Fee Item Description', M + 3, tableY + 4.8, { size: 8.5, style: 'bold', color: WHITE })
  text(doc, 'Amount Due (GHS)', A5_W - M - 42, tableY + 4.8, { size: 8.5, style: 'bold', color: WHITE, align: 'right' })
  text(doc, 'Amount Paid (GHS)', A5_W - M - 3, tableY + 4.8, { size: 8.5, style: 'bold', color: WHITE, align: 'right' })

  // --- RÉCUPÉRATION DYNAMIQUE DU VRAI SOLDE VIA SUPABASE (déplacée avant le tableau) ---
  const year = payment.academic_year || '2025/2026';
  const term = payment.term || 'Term 2';
  const amountPaidToday = parseFloat(payment.amount || payment.total_paid || 0);
  
  let termExpected = 0;
  let termPaidBefore = 0;

  if (classNameVal && classNameVal !== 'N/A') {
    // ⚠️ regex corrigée (espace obligatoire avant le suffixe)
    const levelName = classNameVal.trim().replace(/\s+[A-Za-z]$/, '').trim();
    const { data: level } = await supabase.from('levels').select('id').ilike('name', levelName).maybeSingle();
    
    if (level) {
      const { data: fees } = await supabase.from('fee_structure')
        .select('id, amount').eq('level_id', level.id).eq('academic_year', year)
        .eq('term', term).eq('is_active', true);

      // Récupération des réductions de l'élève
      const { data: discounts } = await supabase
        .from('student_fee_discounts')
        .select('fee_structure_id, discount_type, discount_value')
        .eq('student_id', payment.student_id);
      
      const discountMap = {};
      (discounts || []).forEach(d => {
        discountMap[d.fee_structure_id] = d;
      });

      // ✅ Récupération des overrides de frais pour l'élève
      const { data: overrides } = await supabase
        .from('student_fee_overrides')
        .select('fee_structure_id, override_amount')
        .eq('student_id', payment.student_id);
      const overrideMap = {};
      (overrides || []).forEach(o => { overrideMap[o.fee_structure_id] = o.override_amount; });

      // Calcul du montant attendu avec overrides et réductions
      termExpected = (fees || []).reduce((s, f) => {
        let amount = overrideMap[f.id] !== undefined
          ? parseFloat(overrideMap[f.id])
          : parseFloat(f.amount || 0);
        const disc = discountMap[f.id];
        if (disc) {
          if (disc.discount_type === 'fixed') {
            amount = Math.max(0, amount - parseFloat(disc.discount_value));
          } else { // percentage
            amount = amount * (1 - parseFloat(disc.discount_value) / 100);
          }
        }
        return s + amount;
      }, 0);

      const { data: previousPayments } = await supabase
        .from('fee_payments').select('amount').eq('student_id', payment.student_id)
        .eq('academic_year', year).eq('term', term)
        .in('status', ['paid', 'partial']).neq('id', payment.id);
        
      termPaidBefore = (previousPayments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    }
  }

  // Lecture native du JSON Supabase si 'items' est omis
  let items = payment.items || feeDetails || []
  if (items.length === 0 && payment.fee_items && Array.isArray(payment.fee_items) && payment.fee_items.length > 0) {
    items = payment.fee_items.map(fi => ({
      description: fi.type,
      amount_due: parseFloat(fi.amount),
      amount_paid: parseFloat(fi.amount)
    }))
  }

  const tableItems = items.length > 0 ? items : [
    {
      description: payment.description || payment.payment_type || 'School Fees Allocation',
      amount_due: termExpected,
      amount_paid: payment.amount_paid || payment.amount || 0
    }
  ]

  let currentY = tableY + 7
  tableItems.forEach((item, index) => {
    if (index % 2 === 1) {
      fillRect(doc, M, currentY, CW, 7, [250, 250, 252])
    }
    strokeRect(doc, M, currentY, CW, 7, MGRAY, 0.15)

    text(doc, item.description || 'Fee Item', M + 3, currentY + 4.8, { size: 8.5, color: BLACK, maxWidth: CW - 90 })

    const dueStr = Number(item.amount_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const paidStr = Number(item.amount_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    text(doc, dueStr, A5_W - M - 42, currentY + 4.8, { size: 8.5, color: BLACK, align: 'right' })
    text(doc, paidStr, A5_W - M - 3, currentY + 4.8, { size: 8.5, color: BLACK, align: 'right' })

    currentY += 7
  })

  // 6. SYNTHÈSE FINANCIÈRE
  const summaryY = currentY + 4
  
  text(doc, 'Notes / Remarks:', M, summaryY + 3, { size: 8, style: 'bold', color: BLACK })
  const notesText = payment.notes || 'Payment successfully recorded in the academic portal. Thank you.'
  text(doc, notesText, M, summaryY + 7, { size: 7.5, color: DGRAY, maxWidth: 105 })

  if (payment.payment_method) {
    text(doc, `Payment Method: ${payment.payment_method}`, M, summaryY + 18, { size: 8, style: 'bold', color: BLACK })
  }

  const summaryBoxW = 75   // largeur commune pour les deux blocs
  const summaryBoxX = A5_W - M - summaryBoxW
  const summaryBoxH = 10   // hauteur commune

  // Bloc : TOTAL PAID TODAY
  fillRect(doc, summaryBoxX, summaryY, summaryBoxW, summaryBoxH, GBG)
  strokeRect(doc, summaryBoxX, summaryY, summaryBoxW, summaryBoxH, [187, 247, 208])
  text(doc, 'TOTAL PAID TODAY :', summaryBoxX + 3, summaryY + 7, { size: 9, style: 'bold', color: GREEN })
  
  const totalPaidVal = payment.amount || payment.total_paid || 0
  const totalPaidStr = 'GHS ' + Number(totalPaidVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  text(doc, totalPaidStr, A5_W - M - 3, summaryY + 7, { size: 11, style: 'bold', color: GREEN, align: 'right' })

  // Calcul du solde final réel pour ce trimestre
  const totalBalance = Math.max(0, termExpected - (termPaidBefore + amountPaidToday));

  if (totalBalance >= 0) {
    const balanceBoxW = 90;
    const balanceBoxX = A5_W - M - balanceBoxW;
    const balanceBoxH = 10;
    const balanceY = summaryY + 10;

    fillRect(doc, balanceBoxX, balanceY, balanceBoxW, balanceBoxH, [254, 243, 199]);
    strokeRect(doc, balanceBoxX, balanceY, balanceBoxW, balanceBoxH, [253, 230, 138]);

    text(doc, `OUTSTANDING BALANCE – ${term} :`, balanceBoxX + 3, balanceY + 7, {
      size: 9,
      style: 'bold',
      color: AMBER
    });

    const balanceStr = 'GHS ' + Number(totalBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    text(doc, balanceStr, A5_W - M - 3, balanceY + 7, {
      size: 11,
      style: 'bold',
      color: AMBER,
      align: 'right'
    });
  }

  // 7. ZONE DE SIGNATURE (Retrait de la mention "(Cashier)")
  const footerY = A5_H - 22
  doc.setDrawColor(156, 163, 175)
  doc.setLineWidth(0.25)
  doc.setLineDashPattern([1.5, 1.5], 0)

  doc.line(M, footerY, M + 55, footerY)
  text(doc, 'Received By', M, footerY + 4, { size: 7.5, style: 'bold', color: DGRAY })
  text(doc, payment.collected_by_name || 'Authorized Staff', M, footerY + 8, { size: 7, color: DGRAY })

  doc.setLineDashPattern([], 0)

  // Message de remerciement pour les parents
  text(doc, 'Thank you for your partnership in investing in quality education.', A5_W / 2, A5_H - 6, { size: 9.5, style: 'bold', color: BLUE, align: 'center' })

  // Filigrane vertical gauche
  doc.saveGraphicsState()
  const gState = new GState({ opacity: 0.45 })
  doc.setGState(gState)
  doc.setFontSize(7)
  doc.setTextColor(90, 90, 90)
  doc.setFont('helvetica', 'normal')
  const leftMargin = 3
  const textStr = 'Powered by EduManage GH  •  +233 59 643 8500'
  const textWidth = doc.getTextWidth(textStr)
  doc.text(textStr, leftMargin, A5_H / 2 + textWidth / 2, { angle: 90 })
  doc.restoreGraphicsState()

  // 8. SAUVEGARDE (Ouverture dans un nouvel onglet)
  const pdfUrl = doc.output('bloburl')
  window.open(pdfUrl, '_blank')
  
  return doc
}

/**
 * Génère un numéro de reçu unique depuis la base Supabase
 */
export async function generateReceiptNumber() {
  const { data, error } = await supabase.rpc('next_receipt_number')
  if (error) throw error
  return data
}