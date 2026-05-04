// src/lib/gradeCalculations.js
import { supabase } from './supabase';

/**
 * Calcule les moyennes, le grade et les statistiques de présence d'un élève pour un terme donné.
 * Retourne un objet { subjects, overallAverage, grade, rank, attendance, student }
 */
export async function computeTermReport(studentId, termId) {
  // 0. Récupérer le terme et l'élève
  const { data: termData } = await supabase
    .from('academic_terms')
    .select('*')
    .eq('id', termId)
    .single();

  const { data: student } = await supabase
    .from('students')
    .select('class_id, first_name, last_name, date_of_birth')
    .eq('id', studentId)
    .single();

  if (!student || !termData) {
    return { subjects: [], overallAverage: null, grade: null, rank: null, attendance: null, student };
  }

  // 1. Récupérer les séquences du terme avec leurs pondérations
  const { data: sequences, error: seqError } = await supabase
    .from('assessment_sequences')
    .select('id, weight_percent')
    .eq('term_id', termId);

  if (seqError || !sequences?.length) {
    return { subjects: [], overallAverage: null, grade: null, rank: null, attendance: null, student };
  }

  // 2. Récupérer les matières de la classe pour l'année académique du terme
  const { data: classSubjects } = await supabase
    .from('class_subjects')
    .select('id, subject_id, coefficient, subjects(name)')
    .eq('class_id', student.class_id)
    .eq('academic_year', termData.academic_year)
    .eq('is_active', true);

  if (!classSubjects?.length) {
    return { subjects: [], overallAverage: null, grade: null, rank: null, attendance: null, student };
  }

  // 3. Pour chaque matière, récupérer les notes des séquences
  const subjects = [];
  let totalCoefficient = 0;
  let weightedSum = 0;

  for (const cs of classSubjects) {
    const { data: grades } = await supabase
      .from('grades')
      .select('sequence_id, score')
      .eq('student_id', studentId)
      .eq('class_subject_id', cs.id);

    const gradeMap = {};
    (grades || []).forEach(g => { gradeMap[g.sequence_id] = g.score; });

    let subjectAverage = null;
    if (sequences.every(seq => gradeMap[seq.id] !== undefined)) {
      let sum = 0;
      sequences.forEach(seq => {
        sum += (gradeMap[seq.id] || 0) * (seq.weight_percent / 100);
      });
      subjectAverage = sum;
    }

    subjects.push({
      subjectName: cs.subjects?.name || 'Unknown',
      coefficient: cs.coefficient,
      midTermScore: gradeMap[sequences.find(s => s.weight_percent < 50)?.id] ?? null,
      endTermScore: gradeMap[sequences.find(s => s.weight_percent >= 50)?.id] ?? null,
      average: subjectAverage,
    });

    if (subjectAverage !== null) {
      totalCoefficient += cs.coefficient;
      weightedSum += subjectAverage * cs.coefficient;
    }
  }

  const overallAverage = totalCoefficient > 0 ? parseFloat((weightedSum / totalCoefficient).toFixed(2)) : null;
  const grade = overallAverage !== null ? getGESGrade(overallAverage) : null;

  // 4. Rang (version simplifiée)
  let rank = null;
  if (overallAverage !== null) {
    const { data: classmates } = await supabase
      .from('students')
      .select('id')
      .eq('class_id', student.class_id)
      .eq('active', true);

    let betterCount = 0;
    for (const mate of classmates || []) {
      if (mate.id === studentId) continue;
      const avg = await computeOverallAverage(mate.id, termId, classSubjects, sequences);
      if (avg !== null && avg > overallAverage) betterCount++;
    }
    const totalWithGrades = (classmates || []).filter(m => m.id !== studentId).length;
    rank = totalWithGrades > 0 ? betterCount + 1 : 1;
  }

  // 5. Présence sur la période du terme
  let attendance = null;
  if (termData.start_date && termData.end_date) {
    const { data: attRecords } = await supabase
      .from('attendance')
      .select('status')
      .eq('student_id', studentId)
      .gte('date', termData.start_date)
      .lte('date', termData.end_date);

    const counts = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    (attRecords || []).forEach(a => {
      counts.total++;
      if (a.status === 'P') counts.present++;
      else if (a.status === 'A') counts.absent++;
      else if (a.status === 'L') counts.late++;
      else if (a.status === 'E') counts.excused++;
    });
    attendance = counts;
  }

  return { subjects, overallAverage, grade, rank, attendance, student };
}

function getGESGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}

async function computeOverallAverage(studentId, termId, classSubjects, sequences) {
  let totalCoefficient = 0;
  let weightedSum = 0;

  for (const cs of classSubjects) {
    const { data: grades } = await supabase
      .from('grades')
      .select('sequence_id, score')
      .eq('student_id', studentId)
      .eq('class_subject_id', cs.id);
    const gradeMap = {};
    (grades || []).forEach(g => { gradeMap[g.sequence_id] = g.score; });

    if (sequences.every(seq => gradeMap[seq.id] !== undefined)) {
      let sum = 0;
      sequences.forEach(seq => {
        sum += (gradeMap[seq.id] || 0) * (seq.weight_percent / 100);
      });
      totalCoefficient += cs.coefficient;
      weightedSum += sum * cs.coefficient;
    }
  }

  return totalCoefficient > 0 ? parseFloat((weightedSum / totalCoefficient).toFixed(2)) : null;
}