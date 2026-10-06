// src/lib/mockReportCardGenerator.js
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { supabase } from './supabase';

jsPDF.autoTable = autoTable;

// ── Fallback local (au cas où l'appel RPC échoue) ──
function getGradeInfoFallback(score, isJhs) {
  if (score === null || score === undefined) return { grade: '—', remark: '—' };
  if (isJhs) {
    if (score >= 85) return { grade: '1', remark: 'EXCELLENT' };
    if (score >= 75) return { grade: '2', remark: 'VERY GOOD' };
    if (score >= 66) return { grade: '3', remark: 'QUITE GOOD' };
    if (score >= 60) return { grade: '4', remark: 'GOOD' };
    if (score >= 55) return { grade: '5', remark: 'CREDIT' };
    if (score >= 50) return { grade: '6', remark: 'PASS' };
    if (score >= 45) return { grade: '7', remark: 'AVERAGE' };
    if (score >= 40) return { grade: '8', remark: 'WEAK' };
    return { grade: '9', remark: 'VERY WEAK' };
  } else {
    if (score >= 80) return { grade: 'A', remark: 'ADVANCED' };
    if (score >= 70) return { grade: 'P', remark: 'PROFICIENT' };
    if (score >= 60) return { grade: 'AP', remark: 'APPROACHING PROFICIENCY' };
    if (score >= 50) return { grade: 'D', remark: 'DEVELOPING' };
    return { grade: 'B', remark: 'BEGINNING' };
  }
}

// ── Appel RPC get_grade_info (source unique, dans la base) ──
async function getGradeInfo(score, isJhs) {
  if (score === null || score === undefined) return { grade: '—', remark: '—' };
  try {
    const { data, error } = await supabase.rpc('get_grade_info', {
      p_score: score,
      p_is_jhs: isJhs,
    });
    if (error || !data) throw error;
    return {
      grade: data.grade || '—',
      remark: data.remark || '—',
    };
  } catch (e) {
    console.warn('RPC get_grade_info failed, using fallback:', e);
    return getGradeInfoFallback(score, isJhs);
  }
}

export async function generateMockReportCard({ mockExamId, classId, studentId = null, schoolConfig = {} }) {
  // 1. Mock exam
  const { data: mockExam } = await supabase.from('mock_exams').select('*').eq('id', mockExamId).single();
  if (!mockExam) { alert('Mock exam not found.'); return; }

  // 2. Class + level
  const { data: classInfo } = await supabase
    .from('classes')
    .select('id, name, level_id, levels(name)')
    .eq('id', classId)
    .single();
  if (!classInfo) { alert('Class not found.'); return; }

  const levelName = classInfo.levels?.name || classInfo.name || '';
  const isJhs = levelName.toUpperCase().includes('JHS');

  // 3. Matières de la classe
  const { data: csData } = await supabase
    .from('class_subjects')
    .select('subject_id, subjects(name)')
    .eq('class_id', classId)
    .eq('academic_year', mockExam.academic_year)
    .eq('is_active', true);

  const subjects = (csData || [])
    .map(cs => ({ id: cs.subject_id, name: cs.subjects?.name || 'Subject' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!subjects.length) { alert('No subjects configured for this class.'); return; }

  // 4. Tous les élèves actifs
  const { data: allClassStudents } = await supabase
    .from('students')
    .select('id, first_name, last_name, date_of_birth')
    .eq('class_id', classId)
    .eq('status', 'active');

  if (!allClassStudents?.length) { alert('No students found.'); return; }

  const allIds = allClassStudents.map(s => s.id);

  // 5. Résultats du mock
  const { data: allResults } = await supabase
    .from('mock_results')
    .select('student_id, subject_id, score')
    .eq('mock_exam_id', mockExamId)
    .in('student_id', allIds);

  const scoresMap = {};
  (allResults || []).forEach(r => {
    if (!scoresMap[r.student_id]) scoresMap[r.student_id] = {};
    scoresMap[r.student_id][r.subject_id] = parseFloat(r.score || 0);
  });

  // 6. Moyennes + rang
  const averages = allClassStudents.map(s => {
    const sc = scoresMap[s.id] || {};
    const vals = subjects.map(sub => sc[sub.id]).filter(v => v !== undefined && v !== null);
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length > 0 ? total / vals.length : 0;
    return { studentId: s.id, average: avg };
  });
  averages.sort((a, b) => b.average - a.average);
  const rankMap = {};
  averages.forEach((a, idx) => { rankMap[a.studentId] = idx + 1; });
  const totalOnRoll = averages.length;

  // 7. Élèves à imprimer
  const studentsToPrint = studentId
    ? allClassStudents.filter(s => s.id === studentId)
    : allClassStudents;
  if (!studentsToPrint.length) { alert('Student not found.'); return; }

  // 8. Logo
  const school = {
    name:    (schoolConfig.school_name || 'SCHOOL NAME').toUpperCase(),
    address: schoolConfig.address || '',
    phone:   schoolConfig.phone   || '',
    email:   schoolConfig.email   || '',
    logo:    schoolConfig.logo    || null,
  };
  let logoData = null;
  if (school.logo) {
    try {
      const response = await fetch(school.logo);
      const blob = await response.blob();
      const reader = new FileReader();
      logoData = await new Promise(resolve => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) { console.warn('Logo load failed'); }
  }

  // 9. PDF
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;

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

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  };

  // ═══════════════════════════════════════════════════════
  // Boucle : une page par élève
  // ═══════════════════════════════════════════════════════
  for (let sIdx = 0; sIdx < studentsToPrint.length; sIdx++) {
    const student = studentsToPrint[sIdx];
    if (sIdx > 0) doc.addPage();

    let y = 0;

    // Drapeau Ghana
    const stripeWidth = pageW / 3;
    doc.setFillColor(206, 17, 38); doc.rect(0, 0, stripeWidth, 4, 'F');
    doc.setFillColor(252, 209, 22); doc.rect(stripeWidth, 0, stripeWidth, 4, 'F');
    doc.setFillColor(0, 107, 61); doc.rect(stripeWidth * 2, 0, stripeWidth, 4, 'F');

    const starCX = stripeWidth + (stripeWidth / 2);
    const starLines = [
      [0.336, 1.037], [1.090, 0], [-0.881, 0.640], [0.335, 1.036],
      [-0.880, -0.640], [-0.880, 0.640], [0.335, -1.036], [-0.881, -0.640],
      [1.090, 0]
    ];
    doc.setFillColor(0, 0, 0);
    doc.lines(starLines, starCX, 0.5, [1, 1], 'F', true);

    y = 5;
    if (logoData) {
      const logoSize = 40;
      const logoX = pageW / 2 - logoSize / 2;
      try { doc.addImage(logoData, 'PNG', logoX, y, logoSize, logoSize); } catch (e) {}
      y += logoSize + 2;
    }
    y += 5;

    // Nom école
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...colors.navy);
    doc.text(school.name, pageW / 2, y, { align: 'center' });

    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.inkSoft);
    const contact = [school.phone, school.email].filter(Boolean).join('  ·  ');
    doc.text(`${school.address}   ${contact}`, pageW / 2, y, { align: 'center' });
    y += 6;

    // Bandeau "MOCK EXAMINATION REPORT"
    doc.setFillColor(...colors.navy);
    doc.rect(14, y, pageW - 28, 8.45, 'F');
    doc.setDrawColor(...colors.gold);
    doc.setLineWidth(0.4);
    doc.line(14, y, pageW - 14, y);
    doc.line(14, y + 8.45, pageW - 14, y + 8.45);
    doc.setFont('times', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...colors.gold);
    doc.text('— MOCK EXAMINATION REPORT —', pageW / 2, y + 6, { align: 'center' });
    y += 10.5;

    // Biodata
    doc.setFillColor(...colors.paper);
    doc.setDrawColor(217, 205, 166);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, pageW - 28, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colors.inkSoft);

    doc.text('NAME OF PUPIL:', 18, y + 6);
    doc.text('CLASS / LEVEL:', 110, y + 6);
    doc.text('MOCK SESSION:', 160, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...colors.navy);
    const fullName = (student.last_name || '') + ' ' + (student.first_name || '');
    doc.text(fullName.toUpperCase(), 18, y + 10.5);
    doc.text(classInfo.name || '—', 110, y + 10.5);
    doc.text(mockExam.name || '—', 160, y + 10.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colors.inkSoft);
    doc.text('DATE OF BIRTH:', 18, y + 16.5);
    doc.text('EXAM DATE:', 110, y + 16.5);
    doc.text('ACADEMIC YEAR:', 160, y + 16.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...colors.ink);
    doc.text(formatDate(student.date_of_birth), 18, y + 20.5);
    doc.text(formatDate(mockExam.exam_date), 110, y + 20.5);
    doc.text(mockExam.academic_year || '—', 160, y + 20.5);

    y += 26;

    // Tableau des matières
    const headRow = ['Subject', 'Score (/100)', 'Grade', 'Position', 'Remarks'];
    const studentScores = scoresMap[student.id] || {};

    // Positions par matière
    const subjectRanks = {};
    subjects.forEach(sub => {
      const subScores = allClassStudents
        .map(s => ({ id: s.id, score: (scoresMap[s.id] || {})[sub.id] }))
        .filter(x => x.score !== undefined && x.score !== null)
        .sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
      const rank = subScores.findIndex(x => x.id === student.id) + 1;
      subjectRanks[sub.id] = rank > 0 ? rank : '—';
    });

    let totalScore = 0;
    let scoredCount = 0;

    // Construction async du tableau
    const tableData = [];
    for (const sub of subjects) {
      const score = studentScores[sub.id];
      const hasScore = score !== undefined && score !== null;
      const numScore = hasScore ? parseFloat(score) : null;
      const gradeInfo = await getGradeInfo(numScore, isJhs);

      if (hasScore) { totalScore += numScore; scoredCount++; }

      tableData.push([
        sub.name,
        hasScore ? numScore.toFixed(1) : '—',
        gradeInfo.grade,
        subjectRanks[sub.id],
        gradeInfo.remark
      ]);
    }

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
        fontSize: 9,
        textColor: colors.ink,
        lineColor: [217, 205, 166],
        lineWidth: 0.1,
        cellPadding: 1.5
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', textColor: colors.navy },
        1: { halign: 'center', fontStyle: 'bold' },
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'center' },
        4: { halign: 'left' }
      },
      alternateRowStyles: { fillColor: colors.paper }
    });

    y = doc.lastAutoTable.finalY + 3;

    // Bandeau résumé
    const avgScore = scoredCount > 0 ? totalScore / scoredCount : 0;
    const overallGrade = await getGradeInfo(avgScore, isJhs);
    const position = rankMap[student.id] || '—';

    const boxHeight = 18;
    const colW = contentW / 4;

    doc.setFillColor(...colors.navy);
    doc.roundedRect(marginX, y, contentW, boxHeight, 2.5, 2.5, 'F');

    const metrics = [
      { label: 'TOTAL SCORE', value: totalScore > 0 ? totalScore.toFixed(1) : '—' },
      { label: 'AVERAGE', value: scoredCount > 0 ? avgScore.toFixed(2) + '%' : '—' },
      { label: 'POSITION IN CLASS', value: position + ' / ' + totalOnRoll },
      { label: 'OVERALL GRADE', value: overallGrade.grade }
    ];

    metrics.forEach((metric, index) => {
      const centerX = marginX + (index * colW) + (colW / 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...colors.gold);
      doc.text(metric.label, centerX, y + 6.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text(String(metric.value), centerX, y + 14.5, { align: 'center' });

      if (index < 3) {
        const lineX = marginX + ((index + 1) * colW);
        doc.setDrawColor(...colors.gold);
        doc.setLineWidth(0.3);
        doc.line(lineX, y + 4, lineX, y + 14);
      }
    });

    y += boxHeight + 6;

    // Appréciation générale
    doc.setFillColor(...colors.paper);
    doc.setDrawColor(217, 205, 166);
    doc.roundedRect(14, y, pageW - 28, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...colors.inkSoft);
    doc.text('APPRECIATION:', 18, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...colors.navy);
    doc.text(overallGrade.remark || '—', 18, y + 11, { maxWidth: pageW - 40 });

    y += 18;

    // Remarques
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
    doc.text('Signature', 14, y + 4);

    const lineX = pageW / 2 + 10;
    doc.line(lineX, y, pageW - 14, y);
    doc.text('Signature & Stamp', lineX, y + 4);

    const printDate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...colors.inkSoft);
    doc.text('Date of Issue: ' + printDate, 14, y + 10);

    // Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text('Powered by EduManage GH  •  +233 59 643 8500', pageW / 2, pageH - 6, { align: 'center' });
  }

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}