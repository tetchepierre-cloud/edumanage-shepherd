// src/lib/kgReportCardGenerator.js
import { jsPDF } from 'jspdf';
import { supabase } from './supabase';

const RUBRIC_LABELS = { 'E': 'Emerging', 'D': 'Developing', 'A': 'Achieving', 'Ex': 'Extending' };
const RUBRIC_DESC = {
  'E': 'Beginning to develop the skill',
  'D': 'Showing progress with support',
  'A': 'Consistently demonstrating the skill',
  'Ex': 'Exceeding expectations independently',
};

export async function generateKgReportCard({ studentId, termId, className, school }) {
  // Récupérer les évaluations de l'élève pour ce terme
  const { data: assessments } = await supabase
    .from('kg_assessments')
    .select('domain, rubric')
    .eq('student_id', studentId)
    .eq('term_id', termId);

  // Récupérer infos élève
  const { data: student } = await supabase
    .from('students')
    .select('first_name, last_name, date_of_birth')
    .eq('id', studentId)
    .single();

  // Récupérer le terme
  const { data: term } = await supabase
    .from('academic_terms')
    .select('name, academic_year')
    .eq('id', termId)
    .single();

  // Récupérer la présence
  const { data: termData } = await supabase
    .from('academic_terms')
    .select('start_date, end_date')
    .eq('id', termId)
    .single();

  let attendance = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
  if (termData) {
    const { data: atts } = await supabase
      .from('attendance')
      .select('status')
      .eq('student_id', studentId)
      .gte('date', termData.start_date)
      .lte('date', termData.end_date);
    (atts || []).forEach(a => {
      attendance.total++;
      if (a.status === 'P') attendance.present++;
      else if (a.status === 'A') attendance.absent++;
      else if (a.status === 'L') attendance.late++;
      else if (a.status === 'E') attendance.excused++;
    });
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // En-tête école
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name || 'School Name', pageW / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(school.address || '', pageW / 2, y, { align: 'center' });
  y += 5;
  if (school.phone) { doc.text(`Tel: ${school.phone}`, pageW / 2, y, { align: 'center' }); y += 5; }
  y += 5;

  // Titre
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('KINDERGARTEN PROGRESS REPORT', pageW / 2, y, { align: 'center' });
  y += 10;

  // Infos élève
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Student: ${student?.last_name} ${student?.first_name}`, margin, y);
  doc.text(`Class: ${className}`, margin + 100, y);
  y += 6;
  doc.text(`Term: ${term?.name} (${term?.academic_year})`, margin, y);
  const dob = student?.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString('en-GB') : '—';
  doc.text(`Date of Birth: ${dob}`, margin + 100, y);
  y += 10;

  // Tableau des domaines
  const headers = ['Learning Domain', 'Level', 'Description'];
  const colWidths = [70, 35, 75];
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  let xh = margin;
  headers.forEach((h, i) => {
    doc.setFillColor(30, 77, 145);
    doc.rect(xh, y, colWidths[i], 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(h, xh + 1, y + 5);
    xh += colWidths[i];
  });
  y += 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  (assessments || []).forEach((a, idx) => {
    if (y > 240) { doc.addPage(); y = margin; }
    doc.setFillColor(idx % 2 === 0 ? 245 : 255);
    doc.rect(margin, y, colWidths.reduce((a, b) => a + b), 6, 'F');
    const rubric = a.rubric || '—';
    doc.text(a.domain, margin + 1, y + 4.5);
    doc.text(RUBRIC_LABELS[rubric] || rubric, margin + colWidths[0] + 1, y + 4.5);
    doc.text(RUBRIC_DESC[rubric] || '', margin + colWidths[0] + colWidths[1] + 1, y + 4.5, { maxWidth: colWidths[2] - 2 });
    y += 6;
  });

  // Présence
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Attendance', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const rate = attendance.total > 0 ? ((attendance.present / attendance.total) * 100).toFixed(1) : '0.0';
  doc.text(`Days Present: ${attendance.present}  |  Absent: ${attendance.absent}  |  Late: ${attendance.late}  |  Excused: ${attendance.excused}  |  Total: ${attendance.total}  |  Rate: ${rate}%`, margin, y);
  y += 15;

  // Appréciations
  doc.setFontSize(9);
  doc.text('Teacher Remarks: __________________________________________', margin, y);
  y += 10;
  doc.text('Head of School Remarks: __________________________________________', margin, y);
  y += 15;
  doc.text('Class Teacher Signature: __________________', margin, y);
  doc.text('Head of School Signature: __________________', margin + 100, y);

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}