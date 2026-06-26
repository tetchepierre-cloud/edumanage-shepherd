// src/lib/reportCardGenerator.js
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// Enregistrer le plugin pour que jsPDF l'utilise
jsPDF.autoTable = autoTable;

export async function generateReportCard({ student, report, term, school }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  
  // Palette de couleurs institutionnelles (basée sur le CSS)
  const colors = {
    navy: [11, 31, 58],
    navyLight: [23, 51, 92],
    gold: [200, 147, 42],
    forest: [21, 91, 51],
    red: [168, 32, 26],
    paper: [251, 248, 239],
    ink: [36, 31, 24],
    inkSoft: [91, 86, 72]
  };

      let y = 0;

    // 1. BANDEAU DÉCORATIF – Couleurs du drapeau ghanéen
  const ghanaRed   = [206, 17, 38];   // #CE1126
  const ghanaGold  = [252, 209, 22];  // #FCD116
  const ghanaGreen = [0, 107, 61];    // #006B3D

  const stripeWidth = pageW / 3;
  doc.setFillColor(...ghanaRed);   doc.rect(0, 0, stripeWidth, 4, 'F');
  doc.setFillColor(...ghanaGold);  doc.rect(stripeWidth, 0, stripeWidth, 4, 'F');
  doc.setFillColor(...ghanaGreen); doc.rect(stripeWidth * 2, 0, stripeWidth, 4, 'F');
  y = 4;   // juste en dessous du bandeau

  // 2. LOGO DE L'ÉCOLE
  const hasLogo = !!school?.logo;
  if (hasLogo) {
    y += 0.01;  // petit espace entre le bandeau et le logo
    const logoSize = 40;
    const logoX = pageW / 2 - logoSize / 2;
    try {
      doc.addImage(school.logo, 'PNG', logoX, y, logoSize, logoSize);
    } catch (e) {
      // rien si l'image est invalide
    }
    // Position du texte : bas du logo + 2 mm d'écart + hauteur estimée du texte (8 mm)
    y = y + logoSize + 1 + 4;
  }

  // 3. NOM DE L'ÉCOLE (parfaitement positionné)
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...colors.navy);
  doc.text((school.name || 'SUNRISE INTERNATIONAL SCHOOL').toUpperCase(), pageW / 2, y, { align: 'center' });
  
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.inkSoft);
  const address = school.address || 'P. O. Box 245, Adenta – Accra, Greater Accra Region';
  const contact = school.phone ? `Tel: ${school.phone}  ·  ${school.email || 'info@school.edu.gh'}` : 'Tel: 024 000 0000  ·  info@school.edu.gh';
  doc.text(`${address} \n ${contact}`, pageW / 2, y, { align: 'center' });
  
  y += 12;

  // 4. RUBAN DU TITRE
  doc.setFillColor(...colors.navy);
  doc.rect(14, y, pageW - 28, 8, 'F');
  doc.setDrawColor(...colors.gold);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageW - 14, y);
  doc.line(14, y + 8, pageW - 14, y + 8);
  
  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...colors.gold);
  doc.text('— END OF TERM REPORT —', pageW / 2, y + 5.5, { align: 'center' });
  y += 18;    // plus d'espace pour la grande police

  // 5. BIODATA DE L'ÉLÈVE (Boîte structurée)
  doc.setFillColor(...colors.paper);
  doc.setDrawColor(217, 205, 166);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
  };

  // Ligne 1 Biodata
  doc.text('NAME OF PUPIL:', 18, y + 6);
  doc.text('CLASS / LEVEL:', 110, y + 6);
  doc.text('ACADEMIC YEAR:', 160, y + 6);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...colors.navy);
  doc.text(`${student.last_name} ${student.first_name}`.toUpperCase(), 18, y + 10.5);
  doc.text(`${student.class || '—'}`, 110, y + 10.5);
  doc.text(`${term.academic_year || '—'}`, 160, y + 10.5);

  // Ligne 2 Biodata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  doc.text('DATE OF BIRTH:', 18, y + 16.5);
  doc.text('TERM:', 110, y + 16.5);
  doc.text('POSITION:', 160, y + 16.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.ink);
  doc.text(`${formatDate(student.date_of_birth)}`, 18, y + 20.5);
  doc.text(`${term.name || '—'}`, 110, y + 20.5);
  doc.text(`${report.rank ? report.rank : '—'}`, 160, y + 20.5);

  y += 28;

  // 6. TABLEAU DES NOTES
  const tableData = report.subjects.map(sub => [
    sub.subjectName,
    sub.midTermScore !== null ? sub.midTermScore : '—',
    sub.endTermScore !== null ? sub.endTermScore : '—',
    sub.average !== null ? sub.average.toFixed(1) : '—',
    sub.average !== null ? getGrade(sub.average) : '—',
    sub.remarks || '—'
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Subject', 'S.B.A (50)', 'EXAM (50)', 'TOTAL (100)', 'GRADE', 'REMARKS']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: colors.navy,
      textColor: colors.gold,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
      lineColor: colors.navyLight,
      lineWidth: 0.1
    },
    bodyStyles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: colors.ink,
      lineColor: [217, 205, 166],
      lineWidth: 0.1
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', textColor: colors.navy },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center', fontStyle: 'bold' },
      5: { halign: 'left' }
    },
    alternateRowStyles: {
      fillColor: colors.paper
    },
    foot: [['OVERALL PERFORMANCE', '', '', `Avg: ${report.overallAverage !== null ? report.overallAverage.toFixed(2) + '%' : '—'}`, '', '']],
    footStyles: {
      fillColor: colors.navyLight,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    margin: { left: 14, right: 14 }
  });

  y = doc.lastAutoTable.finalY + 10;

  // 7. PRÉSENCE & ATTITUDE
  if (report.attendance) {
    const a = report.attendance;
    const presenceRate = a.total > 0 ? ((a.present / a.total) * 100).toFixed(1) : '0.0';
    
    doc.setFillColor(...colors.paper);
    doc.setDrawColor(217, 205, 166);
    doc.roundedRect(14, y, pageW - 28, 14, 2, 2, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colors.inkSoft);
    
    doc.text('ATTENDANCE RECORD:', 18, y + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...colors.navy);
    doc.text(`School Opened: ${a.total} days`, 18, y + 11);
    doc.text(`Times Present: ${a.present}`, 65, y + 11);
    doc.text(`Times Absent: ${a.absent}`, 110, y + 11);
    doc.text(`Attendance Rate: ${presenceRate}%`, 155, y + 11);
    
    y += 20;
  }

  // 8. APPRÉCIATIONS ET SIGNATURES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...colors.navy);
  
  doc.text("CLASS TEACHER'S REMARK", 14, y);
  doc.setDrawColor(217, 205, 166);
  doc.line(14, y + 8, pageW / 2 - 10, y + 8);
  doc.line(14, y + 16, pageW / 2 - 10, y + 16);
  
  doc.text("HEAD TEACHER'S REMARK", pageW / 2 + 10, y);
  doc.line(pageW / 2 + 10, y + 8, pageW - 14, y + 8);
  doc.line(pageW / 2 + 10, y + 16, pageW - 14, y + 16);
  
  y += 30;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  
  doc.text('Signature & Date', 14, y);
  doc.line(14, y - 4, pageW / 2 - 10, y - 4);
  
  doc.text('Signature, Stamp & Date', pageW / 2 + 10, y);
  doc.line(pageW / 2 + 10, y - 4, pageW - 14, y - 4);

  // 9. PIED DE PAGE
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('This report remains the property of the school. Parents/Guardians are kindly requested to review and sign.', pageW / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

  // 10. AFFICHAGE
  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}

function getGrade(score) {
  if (score >= 80) return 'ADV (A)';
  if (score >= 70) return 'PROF (P)';
  if (score >= 60) return 'APROF (AP)';
  if (score >= 50) return 'DEV (D)';
  return 'BEG (B)';
}