// src/pages/GradeEntryPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Save, Lock, AlertTriangle } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

const DEFAULT_CA_COMPONENTS = [
  { name: 'Class Exercises', weight: 20 },
  { name: 'Homework', weight: 20 },
  { name: 'Quizzes', weight: 30 },
  { name: 'Projects', weight: 20 },
  { name: 'Group Work', weight: 10 },
];

export default function GradeEntryPage() {
  const [terms, setTerms] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [classes, setClasses] = useState([]);

  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedSequence, setSelectedSequence] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');

  const [classSubjects, setClassSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState({});       // { studentId: { score, source } }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // ---- Continuous Assessment ----
  const [caMode, setCaMode] = useState(false);
  const [caComponents, setCaComponents] = useState([]);
  const [caScores, setCaScores] = useState({});
  const [caMessage, setCaMessage] = useState('');

  useEffect(() => {
    supabase.from('academic_terms').select('*').eq('is_active', true).order('term_number')
      .then(({ data }) => setTerms(data || []));
    supabase.from('classes').select('id, name').order('sort_order')
      .then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    if (!selectedTerm) { setSequences([]); return; }
    supabase.from('assessment_sequences')
      .select('*').eq('term_id', selectedTerm).eq('status', 'open').order('name')
      .then(({ data }) => setSequences(data || []));
  }, [selectedTerm]);

  useEffect(() => {
    if (!selectedClass || !selectedTerm) { setClassSubjects([]); return; }
    const term = terms.find(t => t.id === selectedTerm);
    const year = term?.academic_year || '';
    if (!year) return;
    supabase.from('class_subjects')
      .select('id, coefficient, subjects(name)')
      .eq('class_id', selectedClass).eq('academic_year', year).eq('is_active', true).order('subject_id')
      .then(({ data }) => {
        setClassSubjects(data || []);
        if (data?.length) setSelectedSubject(data[0].id);
      });
  }, [selectedClass, selectedTerm]);

  useEffect(() => {
    if (!selectedClass || !selectedSequence || !selectedSubject) {
      setStudents([]); setGrades({}); setCaScores({}); return;
    }
    setLoading(true);
    Promise.all([
      supabase.from('students').select('id, first_name, last_name').eq('class_id', selectedClass).eq('active', true).order('last_name'),
      supabase.from('grades').select('student_id, score, source').eq('class_subject_id', selectedSubject).eq('sequence_id', selectedSequence),
      supabase.from('ca_components').select('*').eq('class_subject_id', selectedSubject).order('name'),
    ]).then(([pupilsRes, gradesRes, compRes]) => {
      setStudents(pupilsRes.data || []);
      const map = {};
      (gradesRes.data || []).forEach(g => { map[g.student_id] = { score: g.score, source: g.source || 'direct' }; });
      setGrades(map);
      setCaComponents(compRes.data || []);
      setLoading(false);
    });
  }, [selectedClass, selectedSequence, selectedSubject]);

  useEffect(() => {
    if (caComponents.length === 0 || students.length === 0) { setCaScores({}); return; }
    supabase.from('ca_scores')
      .select('student_id, ca_component_id, score')
      .in('student_id', students.map(s => s.id))
      .in('ca_component_id', caComponents.map(c => c.id))
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(s => {
          if (!map[s.student_id]) map[s.student_id] = {};
          map[s.student_id][s.ca_component_id] = s.score;
        });
        setCaScores(map);
      });
  }, [caComponents, students]);

  // ── Mode direct ────────────────────────────────────────────────
  const handleScoreChange = (studentId, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) return;
    setGrades(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], score: num },
    }));
  };

  const handleSaveDirect = async () => {
    if (!selectedSequence || !selectedSubject || students.length === 0) return;
    setSaving(true); setMessage('');
    const payload = students
      .filter(s => grades[s.id]?.source !== 'ca' && grades[s.id]?.score != null)
      .map(s => ({
        student_id: s.id,
        class_subject_id: selectedSubject,
        sequence_id: selectedSequence,
        score: grades[s.id].score,
        source: 'direct',
      }));

    if (payload.length === 0) {
      setMessage('No editable grades (all are CA‑locked).');
      setSaving(false);
      return;
    }
    const { error } = await supabase.from('grades').upsert(payload, {
      onConflict: 'student_id, class_subject_id, sequence_id',
    });
    if (error) setMessage(`Error: ${error.message}`);
    else setMessage('Direct grades saved.');
    setSaving(false);
  };

  // ── Continuous Assessment ──────────────────────────────────────
  const addComponent = async () => {
    const { data, error } = await supabase.from('ca_components').insert({
      class_subject_id: selectedSubject,
      name: 'New Component',
      weight: 10,
      max_score: 100,
    }).select().single();
    if (!error && data) setCaComponents(prev => [...prev, data]);
  };

  const updateComponent = async (id, field, value) => {
    await supabase.from('ca_components').update({ [field]: value }).eq('id', id);
    setCaComponents(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const deleteComponent = async (id) => {
    await supabase.from('ca_components').delete().eq('id', id);
    setCaComponents(prev => prev.filter(c => c.id !== id));
  };

  const handleCaScoreChange = (studentId, componentId, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) return;
    setCaScores(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [componentId]: num },
    }));
  };

  const handleCalculateAndSave = async () => {
    const caPayload = [];
    students.forEach(s => {
      caComponents.forEach(c => {
        const score = caScores[s.id]?.[c.id];
        if (score !== undefined) {
          caPayload.push({ student_id: s.id, ca_component_id: c.id, sequence_id: selectedSequence, score });
        }
      });
    });
    if (caPayload.length > 0) {
      const { error: caError } = await supabase.from('ca_scores').upsert(caPayload, {
        onConflict: 'student_id, ca_component_id, sequence_id',
      });
      if (caError) { setCaMessage('Error saving CA scores: ' + caError.message); return; }
    }

    const calculatedGrades = {};
    students.forEach(s => {
      let totalWeight = 0, weightedSum = 0;
      caComponents.forEach(c => {
        const w = parseFloat(c.weight) || 0;
        const sc = caScores[s.id]?.[c.id];
        if (sc !== undefined && w > 0) {
          const max = parseInt(c.max_score) || 100;
          const normalized = (sc / max) * 100;  // ramène la note sur 100
          weightedSum += normalized * w;
          totalWeight += w;
        }
      });
      if (totalWeight > 0) calculatedGrades[s.id] = parseFloat((weightedSum / totalWeight).toFixed(2));
    });

    const gradePayload = students
      .filter(s => calculatedGrades[s.id] != null)
      .map(s => ({
        student_id: s.id,
        class_subject_id: selectedSubject,
        sequence_id: selectedSequence,
        score: calculatedGrades[s.id],
        source: 'ca',
      }));

    if (gradePayload.length === 0) {
      setCaMessage('No grades to save. Ensure all students have at least one CA score.');
      return;
    }

    const { error: gradeError } = await supabase.from('grades').upsert(gradePayload, {
      onConflict: 'student_id, class_subject_id, sequence_id',
    });
    if (gradeError) setCaMessage('Error saving grades: ' + gradeError.message);
    else {
      setCaMessage('CA scores and final grades saved!');
      setGrades(prev => {
        const next = { ...prev };
        Object.keys(calculatedGrades).forEach(id => {
          next[id] = { score: calculatedGrades[id], source: 'ca' };
        });
        return next;
      });
    }
  };

  // ── Rendu ──────────────────────────────────────────────────────
  const selectedSubjectName = classSubjects.find(cs => cs.id === selectedSubject)?.subjects?.name || 'Subject';

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grade Entry</h1>
          <p className="text-gray-500 text-sm mt-1">
            {caMode ? 'Continuous Assessment' : 'Direct Entry'}
          </p>
        </div>
        {selectedSubject && (
          <CanAct module="grades" section="header" element="Continuous Assessment toggle">
            <button
              onClick={() => { setCaMode(!caMode); setCaMessage(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${caMode ? 'bg-gray-200 text-gray-700' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
            >
              {caMode ? 'Back to Direct Entry' : 'Continuous Assessment'}
            </button>
          </CanAct>
        )}
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <CanSee module="grades" section="selectors" element="Term select">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Term</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[150px]">
              <option value="">-- Select Term --</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name} ({t.academic_year})</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="grades" section="selectors" element="Sequence select">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Open Sequence</label>
            <select value={selectedSequence} onChange={e => setSelectedSequence(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[150px]">
              <option value="">-- Select Sequence --</option>
              {sequences.map(s => <option key={s.id} value={s.id}>{s.name} ({s.sequence_type})</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="grades" section="selectors" element="Class select">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              <option value="">-- Select Class --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="grades" section="selectors" element="Subject select">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
              <option value="">-- Select Subject --</option>
              {classSubjects.map(cs => <option key={cs.id} value={cs.id}>{cs.subjects?.name} (coeff {cs.coefficient})</option>)}
            </select>
          </div>
        </CanSee>
      </div>

      {message && <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>}
      {caMessage && <div className={`px-4 py-3 rounded-lg text-sm ${caMessage.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{caMessage}</div>}

      {!caMode ? (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {!selectedSequence || !selectedSubject ? (
            <div className="text-center py-12 text-gray-400">Select a term, an open sequence, a class and a subject.</div>
          ) : loading ? (
            <div className="text-center py-12 text-gray-500">Loading…</div>
          ) : students.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No active students.</div>
          ) : (
            <>
              <div className="px-6 py-3 bg-blue-50 border-b text-sm font-medium text-blue-700">
                Entering grades for <strong>{selectedSubjectName}</strong>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3">#</th>
                    <th className="text-left px-4 py-3">Student</th>
                    <th className="text-center px-4 py-3">Score (/100)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {students.map((s, idx) => {
                    const g = grades[s.id];
                    const isCa = g?.source === 'ca';
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2 font-medium">{s.last_name} {s.first_name}</td>
                        <td className="px-4 py-2 text-center">
                          {isCa ? (
                            <div className="inline-flex items-center gap-1 bg-gray-100 rounded px-3 py-1" title="Calculated by Continuous Assessment – locked">
                              <Lock size={12} className="text-gray-400" />
                              <span className="font-medium">{g.score}</span>
                              <span className="text-xs text-gray-400 ml-1">CA</span>
                            </div>
                          ) : (
                            <CanAct module="grades" section="table" element="Score fields">
                              <input type="number" min="0" max="100" step="0.01"
                                value={g?.score !== undefined ? g.score : ''}
                                onChange={e => handleScoreChange(s.id, e.target.value)}
                                className="w-20 text-center border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                            </CanAct>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-4 border-t flex justify-end">
                <CanAct module="grades" section="buttons" element="Save Grades button">
                  <button onClick={handleSaveDirect} disabled={saving}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save Grades'}
                  </button>
                </CanAct>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">Assessment Components</h3>
              <button onClick={addComponent} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
                <Plus size={16} /> Add Component
              </button>
            </div>
            {caComponents.length === 0 ? (
              <p className="text-gray-400 text-sm">No components yet.</p>
            ) : (
              <div className="space-y-2">
                {caComponents.map((comp, idx) => (
                  <div key={comp.id} className="flex items-center gap-3">
                    <span className="text-xs w-6">{idx + 1}.</span>
                    <input type="text" value={comp.name}
                      onChange={e => updateComponent(comp.id, 'name', e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-sm" />
                     <input type="number" min="0" max="100" value={comp.weight}
                      onChange={e => updateComponent(comp.id, 'weight', parseFloat(e.target.value) || 0)}
                      className="w-16 border rounded px-2 py-1 text-sm text-center" />
                    <span className="text-xs text-gray-500">%</span>
                    <input type="number" min="1" value={comp.max_score || 100}
                      onChange={e => updateComponent(comp.id, 'max_score', parseInt(e.target.value) || 1)}
                      className="w-16 border rounded px-2 py-1 text-sm text-center" />
                    <span className="text-xs text-gray-500">pts</span>
                    <button onClick={() => deleteComponent(comp.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={async () => {
              for (const c of DEFAULT_CA_COMPONENTS) {
                const { data } = await supabase.from('ca_components').insert({
                  class_subject_id: selectedSubject, name: c.name, weight: c.weight,
                }).select().single();
                if (data) setCaComponents(prev => [...prev, data]);
              }
            }} className="mt-3 text-sm text-blue-600 hover:underline">
              + Insert default components
            </button>
          </div>

          {students.length > 0 && caComponents.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-6 py-3 bg-purple-50 border-b text-sm font-medium text-purple-700">
                Enter scores for <strong>{selectedSubjectName}</strong>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2">Student</th>
                      {caComponents.map(c => (
                        <th key={c.id} className="text-center px-2 py-2 text-xs">
                          {c.name}<br/>({c.weight}%)<br/>
                          <span className="text-gray-400">out of {c.max_score || 100}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map(s => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 font-medium">{s.last_name} {s.first_name}</td>
                        {caComponents.map(c => (
                          <td key={c.id} className="px-2 py-2 text-center">
                            <CanAct module="grades" section="table" element="CA score fields">
                              <input type="number" min="0" max="100" step="0.01"
                                value={caScores[s.id]?.[c.id] !== undefined ? caScores[s.id][c.id] : ''}
                                onChange={e => handleCaScoreChange(s.id, c.id, e.target.value)}
                                className="w-16 text-center border rounded px-1 py-0.5 text-xs"
                              />
                            </CanAct>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t flex justify-end">
                <CanAct module="grades" section="buttons" element="Calculate & Save button">
                  <button onClick={handleCalculateAndSave}
                    className="flex items-center gap-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700">
                    <Save size={16} /> Calculate & Save Final Grades
                  </button>
                </CanAct>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}