// src/lib/timetableGenerator.js
import { jsPDF } from 'jspdf';

export function generateTimetablePDF({ className, slots, school, periods }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`TIMETABLE - ${className.toUpperCase()}`, pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.text(`${school.name || ''} — ${school.address || ''}`, pageW / 2, y, { align: 'center' });
  y += 8;

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayWidth = (pageW - margin * 2) / 8; // 8 colonnes (période + 7 jours)
  const periodWidth = 20;
  const colWidth = (pageW - margin * 2 - periodWidth) / 7;

  // Header days
  doc.setFillColor(30, 77, 145);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.rect(margin, y, periodWidth, 6, 'F');
  doc.text('Period', margin + 2, y + 4.5);
  days.forEach((day, i) => {
    doc.rect(margin + periodWidth + i * colWidth, y, colWidth, 6, 'F');
    doc.text(day.substring(0,3), margin + periodWidth + i * colWidth + 1, y + 4.5);
  });
  y += 6;

  // Rows for periods
  periods.forEach((period, pIdx) => {
    if (y + 10 > pageH - margin) {
      doc.addPage();
      y = margin;
      // Re-draw header
      doc.setFillColor(30, 77, 145);
      doc.setTextColor(255, 255, 255);
      doc.rect(margin, y, periodWidth, 6, 'F');
      doc.text('Period', margin + 2, y + 4.5);
      days.forEach((day, i) => {
        doc.rect(margin + periodWidth + i * colWidth, y, colWidth, 6, 'F');
        doc.text(day.substring(0,3), margin + periodWidth + i * colWidth + 1, y + 4.5);
      });
      y += 6;
    }

    doc.setDrawColor(200);
    doc.setFillColor(pIdx % 2 === 0 ? 255 : 245);
    doc.rect(margin, y, periodWidth, 8, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(`${period.label || 'P'+period.number}${period.time ? '\n'+period.time : ''}`, margin + 1, y + 5);

    days.forEach((day, dIdx) => {
      const dayIdx = dIdx + 1;
      const slot = slots.find(s => s.day_of_week === dayIdx && s.period_number === period.number);
      doc.rect(margin + periodWidth + dIdx * colWidth, y, colWidth, 8, 'FD');
      if (slot) {
        doc.setFontSize(7);
        doc.setTextColor(0);
        const subject = slot.class_subjects?.subjects?.name || '—';
        const teacher = slot.class_subjects?.staff
          ? `${slot.class_subjects.staff.first_name?.charAt(0)}. ${slot.class_subjects.staff.last_name}`
          : '';
        doc.text(subject, margin + periodWidth + dIdx * colWidth + 1, y + 3.5);
        if (teacher) doc.text(teacher, margin + periodWidth + dIdx * colWidth + 1, y + 6.5);
      }
    });
    y += 8;
  });

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}