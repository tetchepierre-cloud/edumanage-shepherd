// src/lib/gesReportGenerator.js
import { jsPDF } from 'jspdf';
import { supabase } from './supabase';

export async function generateGesReport({ academicYear, school }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // ── Couleurs professionnelles ──
  const NAVY = [30, 77, 145];
  const DARK_GRAY = [60, 60, 60];

  // ── En-tête école ──
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(school.name || 'School Name', pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_GRAY);
  doc.text(school.address || '', pageW / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Annual Statistical Report – ${academicYear}`, pageW / 2, y, { align: 'center' });
  y += 10;

  // ── 1. Enrolment ──
  const { data: students } = await supabase
    .from('students')
    .select('id, class_id, gender, classes(name, level)')
    .eq('active', true);

  const enrolmentMap = {};
  (students || []).forEach(s => {
    const cls = s.classes?.name || 'Unknown';
    if (!enrolmentMap[cls]) enrolmentMap[cls] = { boys: 0, girls: 0 };
    if (s.gender?.toLowerCase() === 'male') enrolmentMap[cls].boys++;
    else if (s.gender?.toLowerCase() === 'female') enrolmentMap[cls].girls++;
  });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text('1. Enrolment', margin, y);
  y += 6;

  const colStarts = [margin, margin + 60, margin + 80, margin + 100];
  const colWidths = [60, 20, 20, 20];
  const headers = ['Class', 'Boys', 'Girls', 'Total'];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  headers.forEach((h, i) => {
    doc.setFillColor(...NAVY);
    doc.rect(colStarts[i], y, colWidths[i], 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(h, colStarts[i] + colWidths[i] / 2, y + 4, { align: 'center' });
  });
  y += 6;

  doc.setTextColor(...DARK_GRAY);
  doc.setFont('helvetica', 'normal');
  let totalBoys = 0, totalGirls = 0;

  Object.keys(enrolmentMap).sort().forEach((cls, idx) => {
    const { boys, girls } = enrolmentMap[cls];
    totalBoys += boys;
    totalGirls += girls;

    if (y > pageH - 25) { doc.addPage(); y = margin; }

    doc.setFillColor(idx % 2 === 0 ? 255 : 248, 248, 248);
    doc.rect(margin, y, 120, 6, 'F');
    doc.setDrawColor(220);
    doc.setLineWidth(0.1);
    doc.rect(margin, y, 120, 6);
    for (let i = 1; i < colStarts.length; i++) {
      doc.line(colStarts[i], y, colStarts[i], y + 6);
    }

    doc.setFontSize(8);
    doc.text(cls, margin + 2, y + 4);
    doc.text(String(boys), colStarts[1] + colWidths[1] / 2, y + 4, { align: 'center' });
    doc.text(String(girls), colStarts[2] + colWidths[2] / 2, y + 4, { align: 'center' });
    doc.text(String(boys + girls), colStarts[3] + colWidths[3] / 2, y + 4, { align: 'center' });

    y += 6;
  });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 120, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(`Total: ${totalBoys + totalGirls} (Boys: ${totalBoys}, Girls: ${totalGirls})`, margin, y);
  y += 10;

  // ── 2. Attendance Summary ──
  const { data: terms } = await supabase
    .from('academic_terms')
    .select('id, name, start_date, end_date')
    .eq('academic_year', academicYear)
    .order('term_number');

  if (terms?.length) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('2. Attendance Summary', margin, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK_GRAY);
    for (const term of terms) {
      const { data: atts } = await supabase
        .from('attendance')
        .select('status')
        .gte('date', term.start_date)
        .lte('date', term.end_date);

      const cnt = { P: 0, A: 0, L: 0, E: 0 };
      (atts || []).forEach(a => { if (cnt[a.status] !== undefined) cnt[a.status]++; });
      const total = cnt.P + cnt.A + cnt.L + cnt.E;
      const rate = total > 0 ? ((cnt.P / total) * 100).toFixed(1) : '0.0';

      if (y > pageH - 20) { doc.addPage(); y = margin; }
      doc.text(
        `${term.name}: Present ${cnt.P}  |  Absent ${cnt.A}  |  Late ${cnt.L}  |  Excused ${cnt.E}  —  Presence Rate: ${rate}%`,
        margin,
        y
      );
      y += 5;
    }
    y += 6;
  }

    // ── 3. BECE Performance (JHS 3) ──
  const { data: jhs3 } = await supabase
    .from('students')
    .select('id, classes!inner(name)')
    .ilike('classes.name', 'JHS 3%')
    .eq('active', true);

  if (jhs3?.length) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('3. BECE Performance (JHS 3)', margin, y);
    y += 6;

    let passed = 0, failed = 0;
    for (const s of jhs3) {
      const { data: results } = await supabase
        .from('bece_real_results')
        .select('score')
        .eq('student_id', s.id)
        .eq('academic_year', academicYear);

      if (results?.length) {
        const avg = results.reduce((a, b) => a + parseFloat(b.score), 0) / results.length;
        if (avg >= 50) passed++; else failed++;
      }
    }

    // Même style que les lignes d'attendance : helvetica, normal, 8pt, gris foncé
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK_GRAY);
    doc.text(
      `Students with BECE results: ${jhs3.length}    |    Passed (>= 50% avg): ${passed}    |    Failed: ${failed}`,
      margin,
      y
    );
    y += 6;
  }

  // ── 4. Staff Summary ──
  const { data: staff } = await supabase
    .from('staff')
    .select('position, gender')
    .eq('active', true);

  const staffCnt = {};
  (staff || []).forEach(s => {
    if (!staffCnt[s.position]) staffCnt[s.position] = { M: 0, F: 0 };
    if (s.gender?.toLowerCase() === 'male') staffCnt[s.position].M++;
    else if (s.gender?.toLowerCase() === 'female') staffCnt[s.position].F++;
  });

  if (Object.keys(staffCnt).length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('4. Staff Summary (Active)', margin, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK_GRAY);
    Object.keys(staffCnt).sort().forEach(pos => {
      if (y > pageH - 20) { doc.addPage(); y = margin; }
      doc.text(`${pos}: Male ${staffCnt[pos].M}, Female ${staffCnt[pos].F}`, margin, y);
      y += 5;
    });
  }

  // ── Pied de page ──
  y = pageH - 25;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')} – EduManage GH`, pageW / 2, y, { align: 'center' });

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}