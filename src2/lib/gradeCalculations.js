// src/lib/gradeCalculations.js
import { supabase } from './supabase';

export async function computeTermReport(studentId, termId) {
  // 1. Appel RPC (pour gradeLetter, remarks, etc.)
  const { data: report, error } = await supabase.rpc('compute_term_report', {
    p_student_id: studentId,
    p_term_id: termId,
  });
  if (error) {
    console.error('RPC error:', error);
    return { subjects: [], overallAverage: null, grade: null, rank: null, attendance: null, student: null };
  }

  // 2. Élève + classe
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, class_id, first_name, last_name, date_of_birth, classes(name)')
    .eq('id', studentId)
    .single();
  if (studentError || !student) {
    console.error('Student error:', studentError);
    return { ...report, student: null };
  }

  // 3. Terme et année académique
  const { data: termData } = await supabase
    .from('academic_terms')
    .select('academic_year')
    .eq('id', termId)
    .single();
  const academicYear = termData?.academic_year || '2025/2026';

  // 4. Matières de la classe
  const { data: classSubjects, error: csError } = await supabase
    .from('class_subjects')
    .select('id, subject_id, coefficient, subjects(name)')
    .eq('class_id', student.class_id)
    .eq('academic_year', academicYear)
    .eq('is_active', true);

  if (csError || !classSubjects || classSubjects.length === 0) {
    console.warn('No subjects found for this class/year. Falling back to RPC.');
    return {
      subjects: report.subjects || [],
      overallAverage: report.overallAverage ?? null,
      grade: report.grade ?? null,
      rank: report.rank ?? null,
      attendance: report.attendance ?? null,
      student: { ...student, class: student.classes?.name },
    };
  }

  // 5. Récupérer les séquences (mid & end)
  const { data: sequences } = await supabase
    .from('assessment_sequences')
    .select('id, sequence_type')
    .eq('term_id', termId);

  const seqMap = {};
  if (sequences) {
    sequences.forEach(s => {
      const type = s.sequence_type.toLowerCase();
      if (type.includes('mid')) seqMap.mid = s.id;
      if (type.includes('end')) seqMap.end = s.id;
    });
  }

  // 6. Notes de l'élève courant
  const { data: grades } = await supabase
    .from('grades')
    .select('class_subject_id, score, sequence_id')
    .eq('student_id', studentId);

  // 7. Map notes
  const notesMap = {};
  if (grades) {
    grades.forEach(g => {
      const key = g.class_subject_id;
      if (!notesMap[key]) notesMap[key] = {};
      if (g.sequence_id === seqMap.mid) notesMap[key].mid = g.score;
      if (g.sequence_id === seqMap.end) notesMap[key].end = g.score;
    });
  }

  // 8. Pondérations
  const isJhs = student.classes?.name?.toUpperCase().includes('JHS') || false;
  const midWeight = isJhs ? 30 : 50;
  const endWeight = isJhs ? 70 : 50;

  // 9. Construire les sujets de l'élève courant
  const subjects = classSubjects.map(cs => {
    const subName = cs.subjects?.name || 'Unknown';
    const midScore = notesMap[cs.id]?.mid ?? null;
    const endScore = notesMap[cs.id]?.end ?? null;

    let total = null;
    let sumWeights = 0, weightedSum = 0;
    if (midScore !== null) {
      weightedSum += midScore * midWeight;
      sumWeights += midWeight;
    }
    if (endScore !== null) {
      weightedSum += endScore * endWeight;
      sumWeights += endWeight;
    }
    if (sumWeights > 0) {
      total = weightedSum / sumWeights;
    }

    const rpcSub = (report.subjects || []).find(s => s.subjectName === subName);

    return {
      subjectName: subName,
      coefficient: cs.coefficient,
      midTermScore: midScore,
      endTermScore: endScore,
      average: total,
      gradeLetter: rpcSub?.gradeLetter ?? null,
      remarks: rpcSub?.remarks ?? null,
      pos: null, // sera recalculé
    };
  });

  // 10. Moyenne générale de l'élève courant
  const validAverages = subjects.map(s => s.average).filter(a => a !== null);
  const overallAvg = validAverages.length > 0
    ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length
    : null;

  // 11. Récupérer tous les élèves de la classe (pour les rangs)
  const { data: allStudents } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .eq('class_id', student.class_id)
    .eq('active', true);

  // Si aucun autre élève, on retourne directement avec rang = 1
  if (!allStudents || allStudents.length <= 1) {
    return {
      subjects,
      overallAverage: overallAvg,
      grade: report.grade ?? null,
      rank: 1,
      attendance: report.attendance ?? null,
      student: { ...student, class: student.classes?.name },
    };
  }

  // 12. Récupérer les notes de tous les élèves de la classe pour les mêmes séquences
  const { data: allGrades } = await supabase
    .from('grades')
    .select('student_id, class_subject_id, score, sequence_id')
    .in('student_id', allStudents.map(s => s.id))
    .in('sequence_id', Object.values(seqMap).filter(Boolean));

  // 13. Construire un map des notes par élève et par matière
  const studentNotesMap = {};
  allStudents.forEach(s => {
    studentNotesMap[s.id] = {};
  });
  if (allGrades) {
    allGrades.forEach(g => {
      const sid = g.student_id;
      const csId = g.class_subject_id;
      if (!studentNotesMap[sid][csId]) studentNotesMap[sid][csId] = {};
      if (g.sequence_id === seqMap.mid) studentNotesMap[sid][csId].mid = g.score;
      if (g.sequence_id === seqMap.end) studentNotesMap[sid][csId].end = g.score;
    });
  }

  // 14. Calculer pour chaque élève les moyennes par matière et générale
  const studentAverages = {};
  allStudents.forEach(s => {
    const sId = s.id;
    const notes = studentNotesMap[sId] || {};
    const subjAverages = {};
    let totalWeighted = 0, totalCoeff = 0;

    classSubjects.forEach(cs => {
      const mid = notes[cs.id]?.mid ?? null;
      const end = notes[cs.id]?.end ?? null;
      let avg = null;
      let sumW = 0, weighted = 0;
      if (mid !== null) { weighted += mid * midWeight; sumW += midWeight; }
      if (end !== null) { weighted += end * endWeight; sumW += endWeight; }
      if (sumW > 0) avg = weighted / sumW;
      subjAverages[cs.id] = avg;
      if (avg !== null) { totalWeighted += avg * cs.coefficient; totalCoeff += cs.coefficient; }
    });

    studentAverages[sId] = {
      subject: subjAverages,
      overall: totalCoeff > 0 ? totalWeighted / totalCoeff : null,
    };
  });

  // 15. Calculer les rangs par matière (séquentiel)
  const subjectRanks = {};
  classSubjects.forEach(cs => {
    const csId = cs.id;
    // Récupérer les moyennes non nulles
    const entries = allStudents
      .map(s => ({ id: s.id, avg: studentAverages[s.id]?.subject[csId] ?? null }))
      .filter(e => e.avg !== null)
      .sort((a, b) => b.avg - a.avg);

    const rankMap = {};
    let rank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].avg < entries[i-1].avg) rank = i + 1;
      rankMap[entries[i].id] = rank;
    }
    subjectRanks[csId] = rankMap;
  });

  // 16. Calculer le rang général (séquentiel)
  const overallEntries = allStudents
    .map(s => ({ id: s.id, avg: studentAverages[s.id]?.overall ?? null }))
    .filter(e => e.avg !== null)
    .sort((a, b) => b.avg - a.avg);

  const overallRankMap = {};
  let rank = 1;
  for (let i = 0; i < overallEntries.length; i++) {
    if (i > 0 && overallEntries[i].avg < overallEntries[i-1].avg) rank = i + 1;
    overallRankMap[overallEntries[i].id] = rank;
  }

  // 17. Mettre à jour les pos dans subjects et le rank global
  subjects.forEach(sub => {
    const csId = classSubjects.find(cs => cs.subjects?.name === sub.subjectName)?.id;
    if (csId && subjectRanks[csId]) {
      sub.pos = subjectRanks[csId][studentId] || null;
    }
  });

  const finalRank = overallRankMap[studentId] || null;

  // 18. Retourner l'objet final
  return {
    subjects,
    overallAverage: overallAvg,
    grade: report.grade ?? null,
    rank: finalRank,
    attendance: report.attendance ?? null,
    student: { ...student, class: student.classes?.name },
  };
}