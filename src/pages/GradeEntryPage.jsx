// src/pages/GradeEntryPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function GradeEntryPage() {
  const [terms, setTerms] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [classes, setClasses] = useState([]);

  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedSequence, setSelectedSequence] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState(''); // class_subject_id

  const [classSubjects, setClassSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState({}); // { [studentId]: score }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Charger les termes actifs (toutes années confondues)
  useEffect(() => {
    const fetchTerms = async () => {
      const { data } = await supabase
        .from('academic_terms')
        .select('*')
        .eq('is_active', true)
        .order('academic_year')
        .order('term_number');
      setTerms(data || []);
    };
    fetchTerms();
    // classes
    supabase.from('classes').select('id, name').order('name').then(({ data }) => setClasses(data || []));
  }, []);

  // Quand un terme est choisi, on récupère ses séquences ouvertes
  useEffect(() => {
    if (!selectedTerm) {
      setSequences([]);
      return;
    }
    supabase
      .from('assessment_sequences')
      .select('*')
      .eq('term_id', selectedTerm)
      .eq('status', 'open')
      .order('name')
      .then(({ data }) => setSequences(data || []));
  }, [selectedTerm]);

  // Quand la classe et la séquence sont choisies, on charge les matières
  useEffect(() => {
    if (!selectedClass || !selectedTerm) {
      setClassSubjects([]);
      return;
    }
    // Trouver l'année académique du terme choisi
    const term = terms.find(t => t.id === selectedTerm);
    const year = term?.academic_year || '';
    if (!year) return;

    supabase
      .from('class_subjects')
      .select('id, coefficient, subjects(name)')
      .eq('class_id', selectedClass)
      .eq('academic_year', year)
      .eq('is_active', true)
      .order('subject_id')
      .then(({ data }) => {
        setClassSubjects(data || []);
        if (data?.length) setSelectedSubject(data[0].id);
      });
  }, [selectedClass, selectedTerm]);

  // Quand la matière (class_subject) est choisie, on charge les élèves et les notes existantes
  useEffect(() => {
    if (!selectedClass || !selectedSequence || !selectedSubject) {
      setStudents([]);
      setGrades({});
      return;
    }
    setLoading(true);
    const load = async () => {
      // Élèves actifs de la classe
      const { data: pupils } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('class_id', selectedClass)
        .eq('active', true)
        .order('last_name');
      setStudents(pupils || []);

      // Notes existantes pour ce class_subject et cette séquence
      const { data: existing } = await supabase
        .from('grades')
        .select('student_id, score')
        .eq('class_subject_id', selectedSubject)
        .eq('sequence_id', selectedSequence);

      const map = {};
      (existing || []).forEach(g => {
        map[g.student_id] = g.score;
      });
      setGrades(map);
      setLoading(false);
    };
    load();
  }, [selectedClass, selectedSequence, selectedSubject]);

  const handleScoreChange = (studentId, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) return; // blocage simple
    setGrades(prev => ({ ...prev, [studentId]: num }));
  };

  const handleSave = async () => {
    if (!selectedSequence || !selectedSubject || students.length === 0) return;
    setSaving(true);
    setMessage('');

    const payload = students.map(s => ({
      student_id: s.id,
      class_subject_id: selectedSubject,
      sequence_id: selectedSequence,
      score: grades[s.id] !== undefined ? grades[s.id] : null,
    }));

    // On utilise upsert pour mettre à jour les notes existantes
    const { error } = await supabase.from('grades').upsert(payload, {
      onConflict: 'student_id, class_subject_id, sequence_id',
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage('Grades saved successfully!');
    }
    setSaving(false);
  };

  const selectedSubjectName = classSubjects.find(cs => cs.id === selectedSubject)?.subjects?.name || 'Subject';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Grade Entry</h1>
        <p className="text-gray-500 text-sm mt-1">Enter grades for an open assessment sequence</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Term</label>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[150px]">
            <option value="">-- Select Term --</option>
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.academic_year})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Open Sequence</label>
          <select value={selectedSequence} onChange={e => setSelectedSequence(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[150px]">
            <option value="">-- Select Sequence --</option>
            {sequences.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.sequence_type})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
            <option value="">-- Select Class --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
          <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">-- Select Subject --</option>
            {classSubjects.map(cs => (
              <option key={cs.id} value={cs.id}>{cs.subjects?.name} (coeff {cs.coefficient})</option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message}
        </div>
      )}

      {/* Tableau des notes */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {!selectedSequence || !selectedSubject ? (
          <div className="text-center py-12 text-gray-400">Select a term, an open sequence, a class and a subject to begin.</div>
        ) : loading ? (
          <div className="text-center py-12 text-gray-500">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No active students in this class.</div>
        ) : (
          <>
            <div className="px-6 py-3 bg-blue-50 border-b text-sm font-medium text-blue-700">
              Entering grades for <strong>{selectedSubjectName}</strong>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Score (/100)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2 font-medium">{s.last_name} {s.first_name}</td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={grades[s.id] !== undefined ? grades[s.id] : ''}
                        onChange={e => handleScoreChange(s.id, e.target.value)}
                        className="w-20 text-center border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Grades'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}