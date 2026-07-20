import { supabase } from './supabase';

export async function computeTermReport(studentId, termId) {
  // 1. Appel RPC (squelette)
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
    console.warn('Aucune matière trouvée pour cette classe/année. Fallback sur RPC.');
    return {
      subjects: report.subjects || [],
      overallAverage: report.overallAverage ?? null,
      grade: report.grade ?? null,
      rank: report.rank ?? null,
      attendance: report.attendance ?? null,
      student: { ...student, class: student.classes?.name },
    };
  }

  // 5. Récupérer les types de séquence (flexible)
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

  // 6. Notes de l'élève
  const { data: grades } = await supabase
    .from('grades')
    .select('class_subject_id, score, sequence_id')
    .eq('student_id', studentId);

  // 7. Construire map notes par class_subject_id et séquence
  const notesMap = {};
  if (grades) {
    grades.forEach(g => {
      const key = g.class_subject_id;
      if (!notesMap[key]) notesMap[key] = {};
      if (g.sequence_id === seqMap.mid) notesMap[key].mid = g.score;
      if (g.sequence_id === seqMap.end) notesMap[key].end = g.score;
    });
  }

  // 8. Construire les sujets
  const isJhs = student.classes?.name?.toUpperCase().includes('JHS') || false;
  const subjects = classSubjects.map(cs => {
    const subName = cs.subjects?.name || 'Inconnu';
    const midScore = notesMap[cs.id]?.mid ?? null;
    const endScore = notesMap[cs.id]?.end ?? null;

    let total = null;
    if (isJhs) {
      if (midScore !== null && endScore !== null) total = (midScore * 0.3) + (endScore * 0.7);
      else if (midScore !== null) total = midScore * 0.3;
      else if (endScore !== null) total = endScore * 0.7;
    } else {
      if (midScore !== null && endScore !== null) total = (midScore / 2) + (endScore / 2);
      else if (midScore !== null) total = midScore / 2;
      else if (endScore !== null) total = endScore / 2;
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
      pos: rpcSub?.pos ?? null,
    };
  });

  // 9. Moyenne générale
  const validAverages = subjects.map(s => s.average).filter(a => a !== null);
  const overallAvg = validAverages.length > 0
    ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length
    : null;

  return {
    subjects,
    overallAverage: overallAvg,
    grade: report.grade ?? null,
    rank: report.rank ?? null,
    attendance: report.attendance ?? null,
    student: { ...student, class: student.classes?.name },
  };
}