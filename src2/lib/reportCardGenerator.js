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

  // Ghana flag stripe
  const ghanaRed = [206, 17, 38];
  const ghanaGold = [252, 209, 22];
  const ghanaGreen = [0, 107, 61];
  const stripeWidth = pageW / 3;

  doc.setFillColor(...ghanaRed);
  doc.rect(0, 0, stripeWidth, 4, 'F');
  doc.setFillColor(...ghanaGold);
  doc.rect(stripeWidth, 0, stripeWidth, 4, 'F');
  doc.setFillColor(...ghanaGreen);
  doc.rect(stripeWidth * 2, 0, stripeWidth, 4, 'F');

  // Black star
  const starCX = stripeWidth + (stripeWidth / 2);
  const starCY = 2;
  const starLines = [
    [0.336, 1.037], [1.090, 0], [-0.881, 0.640], [0.335, 1.036],
    [-0.880, -0.640], [-0.880, 0.640], [0.335, -1.036], [-0.881, -0.640],
    [1.090, 0]
  ];
  doc.setFillColor(0, 0, 0);
  doc.lines(starLines, starCX, starCY - 1.5, [1, 1], 'F', true);

  y = 5;

  if (school && school.logo) {
    const logoSize = 40;
    const logoX = pageW / 2 - logoSize / 2;
    try {
      doc.addImage(school.logo, 'PNG', logoX, y, logoSize, logoSize);
    } catch (e) {
      // ignore
    }
    y += logoSize + 2;
  }

  y += 6;

  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...colors.navy);
  const schoolName = (school && school.name) ? school.name : 'SHEPHERD MIRRORS ACADEMY';
  doc.text(schoolName.toUpperCase(), pageW / 2, y, { align: 'center' });

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...colors.inkSoft);
  const address = (school && school.address) ? school.address : '';
  const phone = (school && school.phone) ? school.phone : '';
  const email = (school && school.email) ? school.email : '';
  const contact = [phone, email].filter(Boolean).join('  ·  ');
  doc.text(`${address}   ${contact}`, pageW / 2, y, { align: 'center' });
  y += 6;

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

  // Biodata
  doc.setFillColor(...colors.paper);
  doc.setDrawColor(217, 205, 166);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);

  const formatDate = function(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  };

  doc.text('NAME OF PUPIL:', 18, y + 6);
  doc.text('CLASS / LEVEL:', 110, y + 6);
  doc.text('ACADEMIC YEAR:', 160, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...colors.navy);
  const fullName = (student.last_name || '') + ' ' + (student.first_name || '');
  doc.text(fullName.toUpperCase(), 18, y + 10.5);
  doc.text(student.class || '—', 110, y + 10.5);
  doc.text(term.academic_year || '—', 160, y + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);
  doc.text('DATE OF BIRTH:', 18, y + 16.5);
  doc.text('TERM:', 110, y + 16.5);
  doc.text('POSITION:', 160, y + 16.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.ink);
  doc.text(formatDate(student.date_of_birth), 18, y + 20.5);
  doc.text(term.name || '—', 110, y + 20.5);
  doc.text(report.rank ? String(report.rank) : '—', 160, y + 20.5);

  y += 28;

  // ── Tableau des notes (avec mise à l'échelle pour l'affichage) ──
  const isJhs = student.class && student.class.toUpperCase().includes('JHS');
  const headRow = isJhs
    ? ['Subject', 'CLASS (30)', 'EXAM (70)', 'TOTAL (100)', 'GRADE', 'REMARKS']
    : ['Subject', 'S.B.A (50)', 'EXAM (50)', 'TOTAL (100)', 'GRADE', 'REMARKS'];

  const tableData = report.subjects.map(function(sub) {
    let sbaDisplay = '—';
    let examDisplay = '—';
    let totalDisplay = (sub.average !== null && sub.average !== undefined) ? sub.average.toFixed(1) : '—';

    const midRaw = (sub.midTermScore !== null && sub.midTermScore !== undefined) ? sub.midTermScore : null;
    const endRaw = (sub.endTermScore !== null && sub.endTermScore !== undefined) ? sub.endTermScore : null;

    if (isJhs) {
      // JHS : CLASS (30) = mid * 0.3, EXAM (70) = end * 0.7
      sbaDisplay = (midRaw !== null) ? (midRaw * 0.3).toFixed(1) : '—';
      examDisplay = (endRaw !== null) ? (endRaw * 0.7).toFixed(1) : '—';
    } else {
      // Primaire : diviser par 2 car stocké sur 100
      sbaDisplay = (midRaw !== null) ? (midRaw / 2).toFixed(1) : '—';
      examDisplay = (endRaw !== null) ? (endRaw / 2).toFixed(1) : '—';
    }

    return [
      sub.subjectName,
      sbaDisplay,
      examDisplay,
      totalDisplay,
      sub.gradeLetter || '—',
      sub.remarks || '—'
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [headRow],
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
    foot: [
      ['OVERALL PERFORMANCE', '', '', 'Avg: ' + (report.overallAverage ? report.overallAverage.toFixed(2) : '—') + '%', '', '']
    ],
    footStyles: {
      fillColor: colors.navyLight,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10
    },
    margin: { left: 14, right: 14 }
  });

  y = doc.lastAutoTable.finalY + 6;

  // Attendance
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
    doc.text('School Opened: ' + a.total + ' days', 18, y + 11);
    doc.text('Times Present: ' + a.present, 65, y + 11);
    doc.text('Times Absent: ' + a.absent, 110, y + 11);
    doc.text('Attendance Rate: ' + presenceRate + '%', 155, y + 11);

    y += 20;
  }

  // Remarks
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

  // Signatures
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.inkSoft);

  doc.line(14, y, pageW / 2 - 10, y);
  doc.text('Signature & Date', 14, y + 4);

  doc.line(pageW / 2 + 10, y, pageW - 14, y);
  doc.text('Signature, Stamp & Date', pageW / 2 + 10, y + 4);

  y += 12;

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

  y += 6;

  // Vacation dates
  if (school && (school.vacationStart || school.resumption)) {
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

    var fmt = function(str) {
      if (!str) return '—';
      var d = new Date(str);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    var endTerm = school.vacationStart ? 'End of Term: ' + fmt(school.vacationStart) : '';
    var nextTerm = school.resumption ? 'Next Term Begins: ' + fmt(school.resumption) : '';
    var combined = [endTerm, nextTerm].filter(Boolean).join('   •   ');

    doc.text(combined, pageW / 2, y + 6.5, { align: 'center' });
    y += 14;
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text('This report remains the property of the school.', pageW / 2, pageH - 4, { align: 'center' });

  // Watermark
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.3 }));
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  doc.setFont('helvetica', 'normal');
  var textStr = 'Powered by EduManage GH  •  +233 59 643 8500';
  var textWidth = doc.getTextWidth(textStr);
  doc.text(textStr, 5, pageH / 2 + textWidth / 2, { angle: 90 });
  doc.restoreGraphicsState();

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}