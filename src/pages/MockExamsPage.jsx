// src/pages/MockExamsPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Eye, Save } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

const MOCK_NAMES = ['Mock 1', 'Mock 2', 'Mock 3'];
const ACADEMIC_YEARS = ['2024/2025', '2025/2026', '2026/2027'];

export default function MockExamsPage() {
  const [mocks, setMocks] = useState([]);
  const [selectedMock, setSelectedMock] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [classSubjects, setClassSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [existingScores, setExistingScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showCreateMock, setShowCreateMock] = useState(false);
  const [newMockForm, setNewMockForm] = useState({
    name: 'Mock 1',
    academic_year: '2025/2026',
    exam_date: ''
  });

  useEffect(() => {
    fetchMocks();
    // Correction : récupération des classes JHS via la relation levels
    supabase.from('classes')
      .select('id, name, levels(name)')
      .order('name')
      .then(({ data }) => {
        const jhsClasses = (data || []).filter(c => c.levels?.name?.startsWith('JHS'));
        setClasses(jhsClasses);
      });
  }, []);

  const fetchMocks = async () => {
    const { data } = await supabase.from('mock_exams').select('*').order('exam_date', { ascending: false });
    setMocks(data || []);
    if (data?.length > 0 && !selectedMock) setSelectedMock(data[0].id);
  };

  const handleCreateMock = async () => {
    if (!newMockForm.name || !newMockForm.academic_year) return;
    const { error } = await supabase.from('mock_exams').insert({
      name: newMockForm.name,
      academic_year: newMockForm.academic_year,
      exam_date: newMockForm.exam_date || null,
    });
    if (error) {
      setMessage('Error creating mock: ' + error.message);
    } else {
      setMessage('Mock exam created!');
      setShowCreateMock(false);
      fetchMocks();
    }
  };

  useEffect(() => {
    if (!selectedClass || !selectedMock) return;
    const mock = mocks.find(m => m.id === selectedMock);
    const year = mock?.academic_year || '';
    if (!year) return;

    supabase
      .from('class_subjects')
      .select('id, subject_id, subjects(name)')
      .eq('class_id', selectedClass)
      .eq('academic_year', year)
      .eq('is_active', true)
      .order('subject_id')
      .then(({ data }) => {
        setClassSubjects(data || []);
        if (data?.length) setSelectedSubject(data[0].id);
      });

    supabase
      .from('students')
      .select('id, first_name, last_name')
      .eq('class_id', selectedClass)
      .eq('active', true)
      .order('last_name')
      .then(({ data }) => setStudents(data || []));
  }, [selectedClass, selectedMock]);

  useEffect(() => {
    if (!selectedSubject || !selectedMock || students.length === 0) {
      setExistingScores({});
      setScores({});
      return;
    }
    setLoading(true);
    const subjectId = classSubjects.find(cs => cs.id === selectedSubject)?.subject_id;
    if (!subjectId) { setLoading(false); return; }

    supabase
      .from('mock_results')
      .select('student_id, score')
      .eq('mock_exam_id', selectedMock)
      .eq('subject_id', subjectId)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.student_id] = r.score; });
        setExistingScores(map);
        setScores(map);
        setLoading(false);
      });
  }, [selectedSubject, selectedMock, students]);

  const handleScoreChange = (studentId, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) return;
    setScores(prev => ({ ...prev, [studentId]: num }));
  };

  const handleSaveScores = async () => {
    if (!selectedMock || !selectedSubject) return;
    const subjectId = classSubjects.find(cs => cs.id === selectedSubject)?.subject_id;
    if (!subjectId) return;

    setSaving(true);
    setMessage('');

    const payload = students
      .filter(s => scores[s.id] !== undefined)
      .map(s => ({
        student_id: s.id,
        mock_exam_id: selectedMock,
        subject_id: subjectId,
        score: scores[s.id],
      }));

    if (payload.length === 0) {
      setMessage('No scores to save.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('mock_results').upsert(payload, {
      onConflict: 'student_id, mock_exam_id, subject_id',
    });

    if (error) setMessage('Error: ' + error.message);
    else setMessage('Scores saved successfully!');
    setSaving(false);
  };

  const selectedSubjectName = classSubjects.find(cs => cs.id === selectedSubject)?.subjects?.name || 'Subject';
  const selectedClassName = classes.find(c => c.id === selectedClass)?.name || '';

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mock Exams (BECE Preparation)</h1>
          <p className="text-gray-500 text-sm mt-1">Manage mock exams and track student performance for JHS classes</p>
        </div>
        <CanAct module="mock-exams" section="header" element="New Mock Exam button">
          <button onClick={() => setShowCreateMock(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            <Plus size={16} /> New Mock Exam
          </button>
        </CanAct>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <CanSee module="mock-exams" section="selectors" element="Mock select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mock Session</label>
            <select value={selectedMock} onChange={e => setSelectedMock(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              {mocks.map(m => <option key={m.id} value={m.id}>{m.name} ({m.academic_year})</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="mock-exams" section="selectors" element="Class select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
              <option value="">-- Select JHS Class --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="mock-exams" section="selectors" element="Subject select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
              <option value="">-- Select Subject --</option>
              {classSubjects.map(cs => <option key={cs.id} value={cs.id}>{cs.subjects?.name}</option>)}
            </select>
          </div>
        </CanSee>
        <CanAct module="mock-exams" section="buttons" element="Save Scores">
          <button onClick={handleSaveScores} disabled={saving} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Scores'}
          </button>
        </CanAct>
      </div>

      {/* Tableau de saisie */}
      {selectedClass && selectedSubject && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-3 bg-blue-50 border-b text-sm font-medium text-blue-700">
            {selectedMock ? mocks.find(m => m.id === selectedMock)?.name : 'Mock'} — {selectedSubjectName} — {selectedClassName}
          </div>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : students.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No active students in this class.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Student</th>
                  <th className="text-center px-4 py-3">Score (/100)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2 font-medium">{s.last_name} {s.first_name}</td>
                    <td className="px-4 py-2 text-center">
                      <CanAct module="mock-exams" section="table" element="Score fields">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={scores[s.id] !== undefined ? scores[s.id] : ''}
                          onChange={e => handleScoreChange(s.id, e.target.value)}
                          className="w-20 text-center border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </CanAct>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal création de mock */}
      {showCreateMock && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">Create New Mock Exam</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Mock Name</label>
                <select value={newMockForm.name} onChange={e => setNewMockForm({...newMockForm, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {MOCK_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
                <select value={newMockForm.academic_year} onChange={e => setNewMockForm({...newMockForm, academic_year: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Exam Date</label>
                <input type="date" value={newMockForm.exam_date} onChange={e => setNewMockForm({...newMockForm, exam_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleCreateMock} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Create</button>
                <button onClick={() => setShowCreateMock(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}