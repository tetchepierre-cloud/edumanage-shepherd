// src/pages/KgAssessmentPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateKgReportCard } from '../lib/kgReportCardGenerator';
import { Printer, Save, ClipboardList, FileSpreadsheet } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

// Les 52 critères stricts du document Word
const KG_CRITERIA = [
  { category: 'PHYSICAL', id: 'physical', items: ['Can throw, catch and kick a ball', 'Shows good physical co-ordination', 'Active and enjoy outdoor play', 'Shows good muscle control'] },
  { category: 'HEALTH', id: 'health', items: ['Attend toilet at acceptable times', 'Attend toilet at acceptable places', 'Can wash hands after toileting', 'Washes hands before and after toileting', 'Can use the handkerchief correctly', 'Has good control of bladder', 'Can indicate toilet needs'] },
  { category: 'SENSES', id: 'senses', items: ['Can differentiate between different tastes', 'Can different between different smells', 'Can differentiate between different sounds', 'Can differentiate between different colors/shapes', 'Can differentiate between textures'] },
  { category: 'PSYCHO-SOCIAL', id: 'social', items: ['Remain cheerful', 'Mixes with others and shows co-operation', 'Willingly accepts social responsibilities', 'Shows confidence during different situations', 'Shows signs of aggression', 'Chooses own friends'] },
  { category: 'LANGUAGE AND COMMUNICATION', id: 'language', items: ['Can express self clearly', 'Can say/sing the alphabets Aa to Zz', 'Can read pictures', 'Can identify objects in the home/school', 'Can scribble/make pre-writing patterns', 'Can tell daily experiences/events', 'Can say/act simple rhymes/stories', 'Can write the letters Aa-Zz', 'Can read two/three letter words', 'Can answer why questions with explanations', 'Can ask questions and describe an activity/event', 'Can recall part or whole story told or heard', 'Can tell/ retell a story sequentially'] },
  { category: 'COGNITIVE / SELF HELP', id: 'cognitive', items: ['Can discover missing parts of a doll', 'Can differentiate objects by touching', 'Can differentiate sounds with objects/animals', 'Can solve simple puzzle problem or by arranging missing parts correctly', 'Can wear socks/shoes correctly', 'Can dress without assistance', 'Can eat tidily by himself/her self'] },
  { category: 'MATHEMATICS', id: 'math', items: ['Can identify the numerals 1-100', 'Can count 1-100', 'Can recognize and name basic shapes', 'Can write the numerals 1-100', 'Can recognize basic colors', 'Can add/subtract numbers up to five (5)'] },
  { category: 'ENVIRONMENTAL STUDIES', id: 'environmental', items: ['Can identify familiar nature sounds/ noise', 'Can identify familiar mechanical sounds', 'Can identify and name plants', 'Can identify and name animals'] }
];

const RUBRICS = [
  { value: 'A', label: 'Always' },
  { value: 'S', label: 'Sometimes' },
  { value: 'N', label: 'Never' },
  { value: 'NH', label: 'Needs Help' }
];

export default function KgAssessmentPage() {
  const [terms, setTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [assessments, setAssessments] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [school, setSchool] = useState({});

  // ── Mode de saisie : 'assessment' ou 'exam' ──
  const [viewMode, setViewMode] = useState('assessment');
  const [subjects, setSubjects] = useState([]);
  const [examResults, setExamResults] = useState({}); // { subject_id: { mid_term, class_work, home_work, end_term } }
  const [savingExam, setSavingExam] = useState(false);
  const [examMessage, setExamMessage] = useState('');

  useEffect(() => {
    supabase.from('academic_terms').select('*').eq('is_active', true).order('term_number')
      .then(({ data }) => setTerms(data || []));

    supabase.from('classes').select('id, name, level').order('sort_order', { ascending: true })
      .then(({ data }) => {
        const preSchoolClasses = (data || []).filter(c => c.level === 'KG' || c.name.toUpperCase().includes('NURSERY') || c.name.toUpperCase().includes('CRECHE'));
        setClasses(preSchoolClasses);
      });

    loadSchoolInfo();
  }, []);

  const loadSchoolInfo = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const cfg = {};
    data?.forEach(d => { cfg[d.key] = d.value; });
    setSchool({ 
      name: cfg.school_name || 'School', 
      address: cfg.address || '', 
      phone: cfg.phone || '', 
      email: cfg.email || cfg.school_email || '', 
      logo: cfg.logo || null,
      vacationStart: cfg.vacation_start_date || '',
      resumption: cfg.resumption_date || ''
    });
  };

  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      setSelectedStudent(null);
      return;
    }
    supabase.from('students').select('id, first_name, last_name, gender').eq('class_id', selectedClass).eq('active', true).order('last_name')
      .then(({ data }) => setStudents(data || []));
  }, [selectedClass]);

  // ── Matières liées à la classe sélectionnée ──
  useEffect(() => {
    if (!selectedClass) {
      setSubjects([]);
      return;
    }
    supabase
      .from('class_subjects')
      .select('subject_id, subjects ( id, name )')
      .eq('class_id', selectedClass)
      .then(({ data }) => {
        const list = (data || [])
          .map(row => row.subjects)
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(list);
      });
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedStudent || !selectedTerm) return;

    supabase.from('kg_assessments').select('domain, rubric').eq('student_id', selectedStudent.id).eq('term_id', selectedTerm)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(a => { map[a.domain] = a.rubric; });
        setAssessments(map);
      });
  }, [selectedStudent, selectedTerm]);

  // ── Chargement des résultats d'examen (colonnes brutes uniquement) ──
  useEffect(() => {
    if (!selectedStudent || !selectedTerm || !selectedClass) {
      setExamResults({});
      return;
    }
    supabase
      .from('kg_exam_results')
      .select('subject_id, mid_term_raw, class_work_raw, home_work_raw, end_term_raw')
      .eq('student_id', selectedStudent.id)
      .eq('term_id', selectedTerm)
      .eq('class_id', selectedClass)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => {
          map[r.subject_id] = {
            mid_term: r.mid_term_raw ?? '',
            class_work: r.class_work_raw ?? '',
            home_work: r.home_work_raw ?? '',
            end_term: r.end_term_raw ?? ''
          };
        });
        setExamResults(map);
      });
  }, [selectedStudent, selectedTerm, selectedClass]);

  const handleRubricChange = (criteriaItem, rubricValue) => {
    setAssessments(prev => ({ ...prev, [criteriaItem]: rubricValue }));
  };

  // ── Sauvegarde des rubriques ──
  const handleSave = async () => {
    if (!selectedTerm || !selectedClass || !selectedStudent) return;

    setSaving(true);
    setMessage('');

    const payload = Object.keys(assessments).map(desc => ({
      student_id: selectedStudent.id,
      class_id: selectedClass,
      term_id: selectedTerm,
      domain: desc,
      rubric: assessments[desc],
    }));

    if (payload.length === 0) {
      setSaving(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('kg_assessments')
        .upsert(payload, { onConflict: 'student_id, class_id, term_id, domain' });

      if (error) {
        setMessage(`Error: ${error.message}`);
        console.error("Supabase Error:", error);
      } else {
        setMessage('Assessments successfully saved!');
      }
    } catch (err) {
      setMessage('A critical error occurred. Check console.');
      console.error("Critical Exception:", err);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  // ── Gestion des champs bruts ──
  const handleExamFieldChange = (subjectId, field, value) => {
    setExamResults(prev => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        [field]: value
      }
    }));
  };

  // ── Calcul automatique des scores ──
  const computeScores = (row) => {
    if (!row) return { classScore: null, examScore: null, total: null };
    const mt = parseFloat(row.mid_term) || 0;
    const cw = parseFloat(row.class_work) || 0;
    const hw = parseFloat(row.home_work) || 0;
    const et = parseFloat(row.end_term) || 0;

    const classScore = (mt / 100) * 20 + (cw / 5) * 5 + (hw / 5) * 5;
    const examScore = (et / 100) * 70;
    const total = classScore + examScore;

    return {
      classScore: parseFloat(classScore.toFixed(2)),
      examScore: parseFloat(examScore.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  };

  // ── Barème GES pour Preschool ──
  const getGradeRemarks = (total) => {
    if (total === null || isNaN(total) || total === '—') return { grade: '', remark: '' };
    const t = parseFloat(total);
    if (t >= 80) return { grade: 'A', remark: 'Advanced' };
    if (t >= 75) return { grade: 'P', remark: 'Proficient' };
    if (t >= 70) return { grade: 'AP', remark: 'Approaching Proficiency' };
    if (t >= 65) return { grade: 'D', remark: 'Developing' };
    return { grade: 'B', remark: 'Beginner' };
  };

  // ── Sauvegarde des résultats d'examen ──
  const handleSaveExam = async () => {
    if (!selectedTerm || !selectedClass || !selectedStudent) return;

    setSavingExam(true);
    setExamMessage('');

    const payload = subjects
      .filter(s => {
        const row = examResults[s.id];
        return row && (
          row.mid_term !== '' ||
          row.class_work !== '' ||
          row.home_work !== '' ||
          row.end_term !== ''
        );
      })
      .map(s => {
        const row = examResults[s.id];
        const mt = parseFloat(row.mid_term) || 0;
        const cw = parseFloat(row.class_work) || 0;
        const hw = parseFloat(row.home_work) || 0;
        const et = parseFloat(row.end_term) || 0;

        const classScore = (mt / 100) * 20 + (cw / 5) * 5 + (hw / 5) * 5;
        const examScore = (et / 100) * 70;
        const total = classScore + examScore;

        return {
          student_id: selectedStudent.id,
          class_id: selectedClass,
          term_id: selectedTerm,
          subject_id: s.id,
          mid_term_raw: mt,
          class_work_raw: cw,
          home_work_raw: hw,
          end_term_raw: et,
          class_score: parseFloat(classScore.toFixed(2)),
          exam_score: parseFloat(examScore.toFixed(2)),
          total: parseFloat(total.toFixed(2)),
          remarks: null
        };
      });

    if (payload.length === 0) {
      setSavingExam(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('kg_exam_results')
        .upsert(payload, { onConflict: 'student_id, class_id, term_id, subject_id' });

      if (error) {
        setExamMessage(`Error: ${error.message}`);
        console.error("Supabase Error:", error);
      } else {
        setExamMessage('Examination results saved!');
      }
    } catch (err) {
      setExamMessage('A critical error occurred. Check console.');
      console.error("Critical Exception:", err);
    } finally {
      setSavingExam(false);
      setTimeout(() => setExamMessage(''), 4000);
    }
  };

  // ── Impression du bulletin ──
  const handlePrint = async () => {
    if (!selectedStudent || !selectedTerm) return;
    const term = terms.find(t => t.id === selectedTerm);
    const className = classes.find(c => c.id === selectedClass)?.name || '';

    const { data: termData } = await supabase.from('academic_terms').select('start_date, end_date').eq('id', selectedTerm).single();
    let attendance = { present: 0, total: 0 };
    if (termData) {
      const { data: atts } = await supabase.from('attendance').select('status').eq('student_id', selectedStudent.id).gte('date', termData.start_date).lte('date', termData.end_date);
      (atts || []).forEach(a => {
        attendance.total++;
        if (a.status === 'P') attendance.present++;
      });
    }

    // ── Récupérer les résultats d'examen ──
    const { data: examRows } = await supabase
      .from('kg_exam_results')
      .select('class_score, exam_score, total, subjects ( name )')
      .eq('student_id', selectedStudent.id)
      .eq('term_id', selectedTerm)
      .eq('class_id', selectedClass);

    // ── Calcul des totaux, moyenne et rang ──
    let totalAllSubjects = 0;
    let count = 0;
    const examRowsWithTotal = (examRows || []).map(r => {
      const total = r.total !== null && !isNaN(r.total) ? r.total : null;
      if (total !== null) {
        totalAllSubjects += total;
        count++;
      }
      return { ...r, total };
    });
    const overallAverage = count > 0 ? totalAllSubjects / count : null;

    // ── Calcul du rang (POSITION IN CLASS) ──
    let rank = null;
    if (selectedClass && selectedTerm) {
      const { data: classResults, error: rankError } = await supabase
        .from('kg_exam_results')
        .select('student_id, total')
        .eq('class_id', selectedClass)
        .eq('term_id', selectedTerm)
        .not('total', 'is', null);
      if (!rankError && classResults) {
        // Grouper par student_id et calculer la moyenne des totaux
        const studentTotals = {};
        const studentCount = {};
        classResults.forEach(r => {
          if (!studentTotals[r.student_id]) {
            studentTotals[r.student_id] = 0;
            studentCount[r.student_id] = 0;
          }
          studentTotals[r.student_id] += r.total;
          studentCount[r.student_id]++;
        });
        const averages = Object.keys(studentTotals).map(id => ({
          student_id: id,
          avg: studentTotals[id] / studentCount[id]
        }));
        averages.sort((a, b) => b.avg - a.avg);
        const currentAvg = averages.find(a => a.student_id === selectedStudent.id);
        if (currentAvg) {
          rank = averages.findIndex(a => a.student_id === selectedStudent.id) + 1;
        }
      }
    }

    const examResultsForPrint = examRowsWithTotal.map(r => {
      const total = r.total !== null ? r.total : '—';
      const gradeInfo = total !== '—' && !isNaN(total) ? getGradeRemarks(total) : null;
      return {
        subject: r.subjects?.name || '—',
        classScore: r.class_score ?? '—',
        examScore: r.exam_score ?? '—',
        total: total,
        grade: gradeInfo ? gradeInfo.grade : '',
        remark: gradeInfo ? gradeInfo.remark : ''
      };
    });

    // ── Récupérer le nombre d'élèves dans la classe (No. ON ROLL) ──
    const { count: numberOnRoll, error: countError } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', selectedClass)
      .eq('active', true);
    if (countError) console.error('Erreur count:', countError);

    const reportData = {
      studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`,
      academicYear: term.academic_year,
      termName: term.name,
      age: '',
      sex: selectedStudent.gender || '—',
      attendance: attendance,
      examResults: examResultsForPrint,
      totalAllSubjects: totalAllSubjects,
      overallAverage: overallAverage,
      rank: rank || '—',
      numberOnRoll: numberOnRoll || 0
    };

    KG_CRITERIA.forEach(group => {
      reportData[group.id] = group.items.map(itemDesc => ({
        desc: itemDesc,
        val: assessments[itemDesc] || ''
      }));
    });

    await generateKgReportCard({
      studentId: selectedStudent.id,
      termId: selectedTerm,
      className,
      school,
      report: reportData
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pre-School Assessments</h1>
        <p className="text-gray-500 text-sm mt-1">Fill out the detailed behavioral and developmental rubrics</p>
      </div>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <CanSee module="kg-assessments" section="header" element="Term select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Term</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[150px]">
              <option value="">-- Select Term --</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name} ({t.academic_year})</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="kg-assessments" section="header" element="Class select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Class (Pre-School)</label>
            <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStudent(null); }} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              <option value="">-- Select Class --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </CanSee>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 bg-white rounded-xl shadow overflow-hidden flex flex-col h-[700px]">
          <div className="p-4 border-b bg-gray-50 font-semibold text-gray-700">Pupils List</div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {!selectedClass ? (
              <p className="text-sm text-gray-400 p-2">Select a class first.</p>
            ) : students.length === 0 ? (
              <p className="text-sm text-gray-400 p-2">No students found.</p>
            ) : (
              students.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${selectedStudent?.id === s.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  {s.last_name} {s.first_name}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl shadow flex flex-col h-[700px]">
          {!selectedStudent ? (
             <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
               <p>Select a pupil from the list to fill their assessment.</p>
             </div>
          ) : (
            <>
              <div className="p-4 border-b bg-blue-50 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h2 className="font-bold text-lg text-blue-900">{selectedStudent.last_name} {selectedStudent.first_name}</h2>
                  <p className="text-xs text-blue-700">Fill the rubrics for {terms.find(t => t.id === selectedTerm)?.name}</p>
                </div>

                <div className="flex items-center gap-2">
                  {/* ── Bascule Assessment / Examination Results ── */}
                  <div className="flex bg-white border rounded-lg p-1 mr-2">
                    <button
                      onClick={() => setViewMode('assessment')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'assessment' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      <ClipboardList size={14} /> Assessment
                    </button>
                    <button
                      onClick={() => setViewMode('exam')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'exam' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      <FileSpreadsheet size={14} /> Examination Results
                    </button>
                  </div>

                  {viewMode === 'assessment' ? (
                    <>
                      {message && <span className="text-sm text-green-600 font-medium self-center mr-2">{message}</span>}
                      <button onClick={handleSave} disabled={saving || !selectedTerm} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                        <Save size={16} /> {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <>
                      {examMessage && <span className="text-sm text-green-600 font-medium self-center mr-2">{examMessage}</span>}
                      <button onClick={handleSaveExam} disabled={savingExam || !selectedTerm} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                        <Save size={16} /> {savingExam ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  )}

                  <button onClick={handlePrint} disabled={!selectedTerm} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                    <Printer size={16} /> Print Report
                  </button>
                </div>
              </div>

              {viewMode === 'assessment' ? (
                <div className="p-6 overflow-y-auto flex-1 space-y-8">
                  {KG_CRITERIA.map(group => (
                    <div key={group.category} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-4 py-2 font-semibold text-gray-700 border-b">{group.category}</div>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                          <tr>
                            <th className="text-left px-4 py-2">Description</th>
                            {RUBRICS.map(r => <th key={r.value} className="text-center px-2 py-2" title={r.label}>{r.value}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {group.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/50">
                              <td className="px-4 py-2 text-gray-700">{item}</td>
                              {RUBRICS.map(r => (
                                <td key={r.value} className="text-center px-2 py-2">
                                  <input
                                    type="radio"
                                    name={`${selectedStudent.id}-${item}`}
                                    checked={assessments[item] === r.value}
                                    onChange={() => handleRubricChange(item, r.value)}
                                    className="w-4 h-4 text-blue-600 cursor-pointer"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 overflow-y-auto flex-1">
                  {subjects.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No subjects configured for this class yet. Add subjects to this class via Class Subjects settings first.
                    </p>
                  ) : (
                    <>
                      <div className="mb-4">
                        <h3 className="font-semibold text-gray-700">End of Term Examination Results</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Mid Term (out of 100) → 20% · Class Work (out of 5) → 5% · Home Work (out of 5) → 5% · End Term (out of 100) → 70%
                        </p>
                      </div>
                      <div className="border rounded-lg overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                            <tr>
                              <th className="text-left px-4 py-2 min-w-[120px]">Subject</th>
                              <th className="text-center px-2 py-2 w-20">Mid Term (100)</th>
                              <th className="text-center px-2 py-2 w-20">Class Work (5)</th>
                              <th className="text-center px-2 py-2 w-20">Home Work (5)</th>
                              <th className="text-center px-2 py-2 w-20">End Term (100)</th>
                              <th className="text-center px-2 py-2 w-16">Class (30)</th>
                              <th className="text-center px-2 py-2 w-16">Exam (70)</th>
                              <th className="text-center px-2 py-2 w-16">Total (100)</th>
                              <th className="text-center px-2 py-2 w-12">GRADE</th>
                              <th className="text-left px-4 py-2 min-w-[100px]">REMARKS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {subjects.map(s => {
                              const row = examResults[s.id] || { mid_term: '', class_work: '', home_work: '', end_term: '' };
                              const { classScore, examScore, total } = computeScores(row);
                              const classScoreDisplay = (classScore !== null && !isNaN(classScore)) ? classScore.toFixed(1) : '—';
                              const examScoreDisplay = (examScore !== null && !isNaN(examScore)) ? examScore.toFixed(1) : '—';
                              const totalDisplay = (total !== null && !isNaN(total)) ? total.toFixed(1) : '—';
                              const gradeInfo = totalDisplay !== '—' ? getGradeRemarks(total) : { grade: '', remark: '' };
                              return (
                                <tr key={s.id} className="hover:bg-blue-50/50">
                                  <td className="px-4 py-2 text-gray-700 font-medium">{s.name}</td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.5"
                                      value={row.mid_term}
                                      onChange={e => handleExamFieldChange(s.id, 'mid_term', e.target.value)}
                                      className="w-16 border rounded px-1 py-1 text-center text-sm"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max="5"
                                      step="0.5"
                                      value={row.class_work}
                                      onChange={e => handleExamFieldChange(s.id, 'class_work', e.target.value)}
                                      className="w-14 border rounded px-1 py-1 text-center text-sm"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max="5"
                                      step="0.5"
                                      value={row.home_work}
                                      onChange={e => handleExamFieldChange(s.id, 'home_work', e.target.value)}
                                      className="w-14 border rounded px-1 py-1 text-center text-sm"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.5"
                                      value={row.end_term}
                                      onChange={e => handleExamFieldChange(s.id, 'end_term', e.target.value)}
                                      className="w-16 border rounded px-1 py-1 text-center text-sm"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center font-semibold text-gray-700">{classScoreDisplay}</td>
                                  <td className="px-2 py-2 text-center font-semibold text-gray-700">{examScoreDisplay}</td>
                                  <td className="px-2 py-2 text-center font-bold text-blue-700">{totalDisplay}</td>
                                  <td className="px-2 py-2 text-center font-semibold text-blue-600">
                                    {gradeInfo.grade ? gradeInfo.grade : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-center text-gray-700">
                                    {gradeInfo.remark ? gradeInfo.remark : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}