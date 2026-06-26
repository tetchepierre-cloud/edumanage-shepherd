// src/pages/KgAssessmentPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CanAct, CanSee } from '../components/PermissionGate';

const RUBRICS = ['E', 'D', 'A', 'Ex'];
const RUBRIC_LABELS = { 'E': 'Emerging', 'D': 'Developing', 'A': 'Achieving', 'Ex': 'Extending' };
const RUBRIC_COLORS = {
  'E': 'bg-red-100 text-red-700',
  'D': 'bg-yellow-100 text-yellow-700',
  'A': 'bg-blue-100 text-blue-700',
  'Ex': 'bg-green-100 text-green-700',
};

export default function KgAssessmentPage() {
  const [terms, setTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [classSubjects, setClassSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.from('academic_terms').select('*').eq('is_active', true).order('term_number')
      .then(({ data }) => setTerms(data || []));
    supabase.from('classes')
      .select('id, name, levels(name)')
      .order('name')
      .then(({ data }) => {
        const kgClasses = (data || []).filter(c => c.levels?.name === 'KG');
        setClasses(kgClasses);
      });
  }, []);

  useEffect(() => {
    if (!selectedClass || !selectedTerm) return;
    const term = terms.find(t => t.id === selectedTerm);
    const year = term?.academic_year || '';
    if (!year) return;

    supabase
      .from('class_subjects')
      .select('id, subject_id, subjects(name)')
      .eq('class_id', selectedClass)
      .eq('academic_year', year)
      .eq('is_active', true)
      .order('subject_id')
      .then(({ data }) => setClassSubjects(data || []));

    supabase
      .from('students')
      .select('id, first_name, last_name')
      .eq('class_id', selectedClass)
      .eq('active', true)
      .order('last_name')
      .then(({ data }) => setStudents(data || []));
  }, [selectedClass, selectedTerm]);

  useEffect(() => {
    if (!selectedTerm || !selectedClass || students.length === 0 || classSubjects.length === 0) return;

    const studentIds = students.map(s => s.id);
    supabase
      .from('kg_assessments')
      .select('student_id, domain, rubric')
      .eq('term_id', selectedTerm)
      .in('student_id', studentIds)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(a => {
          if (!map[a.student_id]) map[a.student_id] = {};
          map[a.student_id][a.domain] = a.rubric;
        });
        setAssessments(map);
      });
  }, [students, classSubjects, selectedTerm]);

  const handleRubricChange = (studentId, domain, rubric) => {
    setAssessments(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [domain]: rubric },
    }));
  };

  const handleSave = async () => {
    if (!selectedTerm || !selectedClass) return;
    setSaving(true);
    setMessage('');

    const payload = [];
    students.forEach(s => {
      classSubjects.forEach(cs => {
        const rubric = assessments[s.id]?.[cs.subjects?.name];
        if (rubric) {
          payload.push({
            student_id: s.id,
            class_id: selectedClass,
            term_id: selectedTerm,
            domain: cs.subjects?.name,
            rubric,
          });
        }
      });
    });

    if (payload.length === 0) {
      setMessage('No assessments to save.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('kg_assessments').upsert(payload, {
      onConflict: 'student_id, class_id, term_id, domain',
    });

    if (error) setMessage(`Error: ${error.message}`);
    else setMessage('KG assessments saved!');
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">KG Assessments</h1>
        <p className="text-gray-500 text-sm mt-1">Enter developmental rubrics for Kindergarten pupils</p>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              <option value="">-- Select Class --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </CanSee>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
      )}

      {students.length > 0 && classSubjects.length > 0 ? (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                  {classSubjects.map(cs => (
                    <th key={cs.id} className="text-center px-3 py-3 font-semibold text-gray-600">{cs.subjects?.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2 font-medium">{s.last_name} {s.first_name}</td>
                    {classSubjects.map(cs => {
                      const rubric = assessments[s.id]?.[cs.subjects?.name] || '';
                      return (
                        <td key={cs.id} className="px-3 py-2 text-center">
                          <CanAct module="kg-assessments" section="grid" element="Rubrics (E/D/A/Ex)">
                            <select
                              value={rubric}
                              onChange={e => handleRubricChange(s.id, cs.subjects?.name, e.target.value)}
                              className={`px-2 py-1 rounded text-xs font-medium border ${rubric ? RUBRIC_COLORS[rubric] : 'border-gray-300'}`}
                            >
                              <option value="">—</option>
                              {RUBRICS.map(r => <option key={r} value={r}>{RUBRIC_LABELS[r]}</option>)}
                            </select>
                          </CanAct>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t flex justify-end">
            <CanAct module="kg-assessments" section="footer" element="Save Assessments">
              <button onClick={handleSave} disabled={saving} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Assessments'}
              </button>
            </CanAct>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">Select a term and a KG class to begin.</div>
      )}
    </div>
  );
}