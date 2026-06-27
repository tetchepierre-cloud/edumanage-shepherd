// src/lib/reportCardGenerator.js
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

jsPDF.autoTable = autoTable;

export async function generateReportCard({ student, report, term, school }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  
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

  // ── Bandeau drapeau du Ghana ──
  const ghanaRed   = [206, 17, 38];
  const ghanaGold  = [252, 209, 22];
  const ghanaGreen = [0, 107, 61];
  const stripeWidth = pageW / 3;
  
  doc.setFillColor(...ghanaRed);   doc.rect(0, 0, stripeWidth, 4, 'F');
  doc.setFillColor(...ghanaGold);  doc.rect(stripeWidth, 0, stripeWidth, 4, 'F');
  doc.setFillColor(...ghanaGreen); doc.rect(stripeWidth * 2, 0, stripeWidth, 4, 'F');

  // ── AJOUT : Étoile Noire du Ghana (Tracé Vectoriel) ──
  const starCX = stripeWidth + (stripeWidth / 2); // Milieu de la bande jaune (axe X)
  const starCY = 2; // Milieu de la hauteur de 4mm (axe Y)
  
  // Coordonnées relatives pour tracer une étoile parfaite (Rayon externe de 1.5mm)
  const starLines = [
    [0.336, 1.037], [1.090, 0], [-0.881, 0.640], [0.335, 1.036],
    [-0.880, -0.640], [-0.880, 0.640], [0.335, -1.036], [-0.881, -0.640],
    [1.090, 0]
  ];
  
  doc.setFillColor(0, 0, 0); // Noir absolu
  // Dessine la forme en partant de la pointe supérieure (starCY - 1.5)
  doc.lines(starLines, starCX, starCY - 1.5, [1, 1], 'F', true);

  y = 5;

  // ── Logo centré (taille 40) ──
  if (school?.logo) {
    const logoSize = 40;
    const logoX = pageW / 2 - logoSize / 2;
    try { doc.addImage(school.logo, 'PNG', logoX, y, logoSize, logoSize); } catch (e) {}
    y = y + logoSize + 2;
  }

  // ── Remontée d'une ligne : 6 mm au lieu de 12 ──
  y += 6;

  // ── Nom de l'école + coordonnées ──
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...colors.navy);
  doc.text((school.name || 'SHEPHERD MIRRORS ACADEMY').toUpperCase(), pageW / 2, y, { align: 'center' });
  
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...colors.inkSoft);
  const address = school.address || '';
  const phone = school.phone || '';
  const email = school.email || '';
  const contact = [phone, email].filter(Boolean).join('  ·  ');
  doc.text(`${address}   ${contact}`, pageW / 2, y, { align: 'center' });
  y += 6;

  // ── Ruban titre ──
  doc.setFillColor(...colors.navy);
  doc.rect(14, y, pageW - 28, 8.45, 'F');
  doc.setDrawColor(...colors.gold);
  doc.setLineWidth(0.4);
  doc.line(14, y, pageW - 14, y);
  doc.line(14, y + 8.45, pageW - 14, y + 8.45);
  
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...colors.gold);
  doc.text('— END OF TERM REPORT —', pageW / 2, y + 6, { align: 'center' });
  y += 10.5;

  // ── BIODATA (format d'origine) ──
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

  // ── Tableau des notes (compact) ──
  const tableData = report.subjects.map(sub => [
    sub.subjectName,
    sub.midTermScore ?? '—',
    sub.endTermScore ?? '—',
    sub.average !== null ? sub.average.toFixed(1) : '—',
    sub.gradeLetter || '—',
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
      fontSize: 10,
      lineColor: colors.navyLight,
      lineWidth: 0.1
    },
    bodyStyles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: colors.ink,
      lineColor: [217, 205, 166],
      lineWidth: 0.1,
      cellPadding: 1.5
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', textColor: colors.navy },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center', fontStyle: 'bold' },
      5: { halign: 'left' }
    },
    alternateRowStyles: { fillColor: colors.paper },
    foot: [['OVERALL PERFORMANCE', '', '', `Avg: ${report.overallAverage?.toFixed(2) || '—'}%`, '', '']],
    footStyles: {
      fillColor: colors.navyLight,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10
    },
    margin: { left: 14, right: 14 }
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── Présence (taille initiale) ──
  if (report.attendance) {
    const a = report.attendance;
    const presenceRate = a.total > 0 ? ((a.present / a.total) * 100).toFixed(1) : '0.0';
    
    doc.setFillColor(...colors.paper);
    doc.setDrawColor(217, 205, 166);
    doc.roundedRect(14, y, pageW - 28, 14, 2, 2, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...colors.inkSoft);
    
    doc.text('ATTENDANCE RECORD:', 18, y + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.navy);
    doc.text(`School Opened: ${a.total} days`, 18, y + 11);
    doc.text(`Times Present: ${a.present}`, 65, y + 11);
    doc.text(`Times Absent: ${a.absent}`, 110, y + 11);
    doc.text(`Attendance Rate: ${presenceRate}%`, 155, y + 11);
    
    y += 20;
  }

  // ── Appréciations ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...colors.navy);
  
  doc.text("CLASS TEACHER'S REMARK", 14, y);
  doc.setDrawColor(217, 205, 166);
  doc.line(14, y + 5, pageW / 2 - 10, y + 5);
  doc.line(14, y + 11, pageW / 2 - 10, y + 11);
  
  doc.text("SCHOOL MANAGER'S REMARK", pageW / 2 + 10, y);
  doc.line(pageW / 2 + 10, y + 5, pageW - 14, y + 5);
  doc.line(pageW / 2 + 10, y + 11, pageW - 14, y + 11);
  
  y += 20;

  // ── Lignes de signature ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  
  doc.line(14, y, pageW / 2 - 10, y);
  doc.text('Signature & Date', 14, y + 4);
  
  doc.line(pageW / 2 + 10, y, pageW - 14, y);
  doc.text('Signature, Stamp & Date', pageW / 2 + 10, y + 4);
  
  y += 12;

  // ── Signature parent ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...colors.navy);
  doc.text("PARENT'S / GUARDIAN'S SIGNATURE", pageW / 2, y, { align: 'center' });
  
  y += 12;
  doc.setDrawColor(...colors.gold);
  doc.line(pageW / 2 - 40, y, pageW / 2 + 40, y);
  
  y += 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.inkSoft);
  doc.text('(Please sign and return this report to the school)', pageW / 2, y, { align: 'center' });

  // ── Dates descendues d'une ligne : +6 mm supplémentaire ──
  y += 6;

  // ── Dates de fin de terme et de reprise (design antérieur) ──
  if (school.vacationStart || school.resumption) {
    y += 4;
    doc.setFillColor(255, 255, 245);
    doc.roundedRect(14, y, pageW - 28, 10, 1.5, 1.5, 'F');
    doc.setDrawColor(...colors.navy);
    doc.setLineWidth(0.3);
    doc.line(14, y, pageW - 14, y);
    doc.line(14, y + 10, pageW - 14, y + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.navy);

    const fmt = (str) => {
      if (!str) return '—';
      const d = new Date(str);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const endTerm = school.vacationStart ? `End of Term: ${fmt(school.vacationStart)}` : '';
    const nextTerm = school.resumption ? `Next Term Begins: ${fmt(school.resumption)}` : '';
    const combined = [endTerm, nextTerm].filter(Boolean).join('   •   ');

    doc.text(combined, pageW / 2, y + 6.5, { align: 'center' });
    y += 14;
  }

  // ── Pied de page ──
  doc.setFont('helvetica', 'normal');  // ← force le style normal
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text('This report remains the property of the school.', pageW / 2, pageH - 4, { align: 'center' });

  // 11. FILIGRANE VERTICAL GAUCHE
  // On utilise un bloc d'état graphique pour ne pas affecter le reste du document
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.3 })); // Opacité légère
  
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70); // Gris doux
  doc.setFont('helvetica', 'normal');
  
  const textStr = 'Powered by EduManage GH  •  +233 59 643 8500';
  const textWidth = doc.getTextWidth(textStr);
  
  // Position : 5mm du bord gauche, centré verticalement sur la page A4
  doc.text(textStr, 5, pageH / 2 + textWidth / 2, { angle: 90 });
  
  doc.restoreGraphicsState();
  // Fin du filigrane

  // ── Affichage ──
  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}