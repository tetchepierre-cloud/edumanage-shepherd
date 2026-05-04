// src/lib/reportCardGenerator.js
import { jsPDF } from 'jspdf';

export function generateReportCard({ student, report, term, school }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // --- En-tête école ---
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name || 'School Name', pageW / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(school.address || '', pageW / 2, y, { align: 'center' });
  y += 5;
  if (school.phone) {
    doc.text(`Tel: ${school.phone}`, pageW / 2, y, { align: 'center' });
    y += 5;
  }
  y += 5;

  // --- Titre ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMINAL REPORT', pageW / 2, y, { align: 'center' });
  y += 10;

  // --- Infos élève ---
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Student: ${student.last_name} ${student.first_name}`, margin, y);
  doc.text(`Class: ${student.class}`, margin + 100, y);
  y += 6;
  doc.text(`Term: ${term.name}  (${term.academic_year})`, margin, y);
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const day = d.getDate();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
};
doc.text(`Date of Birth: ${formatDate(student.date_of_birth)}`, margin + 100, y);
  y += 10;

  // --- Tableau des notes ---
  const headers = ['Subject', 'Mid-Term', 'End-Term', 'Average', 'Grade', 'Remarks'];
  const colWidths = [52, 25, 25, 25, 20, 40];
  const startX = margin;

  // ═══ DESSIN DE LA LIGNE D'EN-TÊTE ═══
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  let xh = startX;
  headers.forEach((header, i) => {
    doc.setFillColor(30, 77, 145);
    doc.rect(xh, y, colWidths[i], 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(header, xh + 1, y + 5);
    xh += colWidths[i];
  });
  y += 7;

  // --- Lignes de données ---
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  report.subjects.forEach((sub, idx) => {
    if (y > pageH - 60) {
      doc.addPage();
      y = margin;
      // Redessiner l'en-tête
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      xh = startX;
      headers.forEach((header, i) => {
        doc.setFillColor(30, 77, 145);
        doc.rect(xh, y, colWidths[i], 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(header, xh + 1, y + 5);
        xh += colWidths[i];
      });
      y += 7;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    }

    doc.setFillColor(idx % 2 === 0 ? 245 : 255);
    doc.rect(startX, y, colWidths.reduce((a, b) => a + b), 6, 'F');

    const avgDisplay = sub.average !== null ? sub.average.toFixed(1) : '—';
    const gradeDisplay = sub.average !== null ? getGrade(sub.average) : '—';

    let xv = startX;
    doc.text(sub.subjectName, xv + 1, y + 4.5);
    xv += colWidths[0];
    doc.text(sub.midTermScore !== null ? sub.midTermScore.toString() : '—', xv + colWidths[1] - 2, y + 4.5, { align: 'right' });
    xv += colWidths[1];
    doc.text(sub.endTermScore !== null ? sub.endTermScore.toString() : '—', xv + colWidths[2] - 2, y + 4.5, { align: 'right' });
    xv += colWidths[2];
    doc.text(avgDisplay, xv + colWidths[3] - 2, y + 4.5, { align: 'right' });
    xv += colWidths[3];
    doc.text(gradeDisplay, xv + colWidths[4] / 2, y + 4.5, { align: 'center' });
    xv += colWidths[4];
    doc.text('', xv + 1, y + 4.5);
    y += 6;
  });

  // --- Présence ---
  if (report.attendance) {
    y += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Attendance', margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const a = report.attendance;
    const presenceRate = a.total > 0 ? ((a.present / a.total) * 100).toFixed(1) : '0.0';
    doc.text(`Days Present: ${a.present}`, margin, y);
    doc.text(`Days Absent: ${a.absent}`, margin + 60, y);
    doc.text(`Days Late: ${a.late}`, margin + 120, y);
    y += 5;
    doc.text(`Days Excused: ${a.excused}`, margin, y);
    doc.text(`Total Days: ${a.total}`, margin + 60, y);
    doc.text(`Presence Rate: ${presenceRate}%`, margin + 120, y);
    y += 8;
  }

  // --- Résumé ---
  y += 2;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Overall Average: ${report.overallAverage !== null ? report.overallAverage.toFixed(2) + '%' : 'N/A'}`, margin, y);
  doc.text(`Grade: ${report.grade || 'N/A'}`, margin + 100, y);
  y += 7;
  doc.text(`Rank: ${report.rank ? report.rank + ' / ' : 'N/A'}`, margin, y);
  y += 15;

  // --- Appréciations ---
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Class Teacher Remarks: __________________________________________', margin, y);
  y += 10;
  doc.text('Head of School Remarks: __________________________________________', margin, y);
  y += 15;

  // --- Pied de page ---
  doc.text('Class Teacher Signature: __________________', margin, y);
  doc.text('Head of School Signature: __________________', margin + 100, y);

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}

function getGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}