// src/lib/attendanceReportGenerator.js
import { jsPDF } from 'jspdf';

export function generateAttendanceRegisterPDF({ className, students, attendanceMap, year, month, school }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });
  const daysInMonth = new Date(year, month, 0).getDate();

  let y = margin;

  // --- En-tête école ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name || 'School Name', pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(school.address || '', pageW / 2, y, { align: 'center' });
  y += 5;
  if (school.phone) {
    doc.text(`Tel: ${school.phone}`, pageW / 2, y, { align: 'center' });
    y += 5;
  }
  y += 3;

  // --- Titre ---
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`ATTENDANCE REGISTER`, pageW / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(12);
  doc.text(`${monthName} ${year}  —  Class: ${className}`, pageW / 2, y, { align: 'center' });
  y += 10;

  // --- Tableau ---
  const colNoWidth = 8;
  const colNameWidth = 45;
  const colDayWidth = (pageW - margin * 2 - colNoWidth - colNameWidth) / daysInMonth;
  const startX = margin;

  // ═══ FONCTION pour dessiner une ligne d'en-tête (corrigée) ═══
  const drawHeader = (yPos) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');

    // Colonne "No."
    doc.setFillColor(30, 77, 145);
    doc.rect(startX, yPos, colNoWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('No.', startX + 1, yPos + 4.5);

    // Colonne "Student"
    doc.setFillColor(30, 77, 145);
    doc.rect(startX + colNoWidth, yPos, colNameWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Student', startX + colNoWidth + 1, yPos + 4.5);

    // Jours (1, 2, 3, ...)
    let xDay = startX + colNoWidth + colNameWidth;
    for (let d = 1; d <= daysInMonth; d++) {
      doc.setFillColor(30, 77, 145);
      doc.rect(xDay, yPos, colDayWidth, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(String(d), xDay + 1, yPos + 4.5);
      xDay += colDayWidth;
    }

    // Remettre le texte en noir pour la suite
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
  };

  // Dessin du premier en-tête
  drawHeader(y);
  y += 6;

  // --- Lignes des élèves ---
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  students.forEach((student, idx) => {
    if (y + 7 > pageH - margin) {
      doc.addPage();
      y = margin;
      drawHeader(y);   // ← corrigé : utilise la fonction propre
      y += 6;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    }

    // Fond alterné
    doc.setFillColor(idx % 2 === 0 ? 245 : 255);
    doc.rect(startX, y, pageW - margin * 2, 7, 'F');

    doc.setFontSize(8);
    doc.text(String(idx + 1), startX + 1, y + 5);
    const name = `${student.last_name} ${student.first_name}`;
    doc.text(name, startX + colNoWidth + 1, y + 5, { maxWidth: colNameWidth - 2 });

    // Statuts des jours
    const stuAtt = attendanceMap[student.id] || {};
    let xDay = startX + colNoWidth + colNameWidth;
    for (let d = 1; d <= daysInMonth; d++) {
      const status = stuAtt[String(d)] || ' ';
      doc.text(status, xDay + 1, y + 5);
      xDay += colDayWidth;
    }
    y += 7;
  });

  // --- Pied de page ---
  y += 15;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Class Teacher Signature: _________________________', margin, y);
  y += 10;
  doc.text('Head of School Signature: _________________________', margin, y);

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}