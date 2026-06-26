import { supabase } from './supabase';

/**
 * Calcule le rapport de term pour un élève et un terme donnés
 * en appelant la fonction PostgreSQL compute_term_report.
 */
export async function computeTermReport(studentId, termId) {
  // 1. Appeler la fonction RPC qui fait tout le calcul côté serveur
  const { data: report, error } = await supabase.rpc('compute_term_report', {
    p_student_id: studentId,
    p_term_id: termId,
  });

  if (error) {
    console.error('Error calling compute_term_report:', error);
    return { subjects: [], overallAverage: null, grade: null, rank: null, attendance: null, student: null };
  }

  // 2. Récupérer les informations de base de l'élève (léger)
  const { data: student } = await supabase
    .from('students')
    .select('class_id, first_name, last_name, date_of_birth')
    .eq('id', studentId)
    .single();

  // 3. Fusionner le rapport et les infos de l'élève
  return {
    subjects: report.subjects || [],
    overallAverage: report.overallAverage ?? null,
    grade: report.grade ?? null,
    rank: report.rank ?? null,
    attendance: report.attendance ?? null,
    student,
  };
}