// src/pages/BeceTrackerPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calculator, Save } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

export default function BeceTrackerPage() {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [allMocks, setAllMocks] = useState([]);
  const [subjectList, setSubjectList] = useState([]);
  const [mockResults, setMockResults] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [realResults, setRealResults] = useState({});
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [message, setMessage] = useState('');
  const [savingReal, setSavingReal] = useState(false);

  useEffect(() => {
    supabase.from('students')
      .select('id, first_name, last_name, class_id, classes!inner(name, level)')
      .eq('active', true)
      .ilike('classes.name', 'JHS 3%')
      .order('last_name')
      .then(({ data }) => setStudents(data || []));

    supabase.from('mock_exams').select('*').order('name').then(({ data }) => setAllMocks(data || []));

    supabase.from('subjects').select('id, name, code').eq('cycle', 'JHS').order('order_index')
      .then(({ data }) => setSubjectList(data || []));
  }, []);

  useEffect(() => {
    if (!selectedStudent || allMocks.length === 0 || subjectList.length === 0) {
      setMockResults([]);
      setPredictions({});
      setRealResults({});
      return;
    }
    loadStudentData(selectedStudent);
  }, [selectedStudent, allMocks, subjectList]);

  const loadStudentData = async (studentId) => {
    const { data: mockData } = await supabase
      .from('mock_results')
      .select('mock_exam_id, subject_id, score')
      .eq('student_id', studentId)
      .in('mock_exam_id', allMocks.map(m => m.id));

    setMockResults(mockData || []);

    const subjectScores = {};
    (mockData || []).forEach(r => {
      if (!subjectScores[r.subject_id]) subjectScores[r.subject_id] = { sum: 0, count: 0 };
      subjectScores[r.subject_id].sum += parseFloat(r.score);
      subjectScores[r.subject_id].count += 1;
    });
    const avgScores = {};
    Object.keys(subjectScores).forEach(subjId => {
      avgScores[subjId] = parseFloat((subjectScores[subjId].sum / subjectScores[subjId].count).toFixed(1));
    });
    setPredictions(avgScores);

    const { data: realData } = await supabase
      .from('bece_real_results')
      .select('subject_id, score')
      .eq('student_id', studentId)
      .eq('academic_year', academicYear);
    const realMap = {};
    (realData || []).forEach(r => { realMap[r.subject_id] = r.score; });
    setRealResults(realMap);
  };

  const handleSaveRealResults = async () => {
    if (!selectedStudent) return;
    setSavingReal(true);
    setMessage('');

    const payload = subjectList
      .filter(sub => realResults[sub.id] !== undefined)
      .map(sub => ({
        student_id: selectedStudent,
        academic_year: academicYear,
        subject_id: sub.id,
        score: realResults[sub.id],
      }));

    if (payload.length === 0) {
      setMessage('No scores entered.');
      setSavingReal(false);
      return;
    }

    const { error } = await supabase.from('bece_real_results').upsert(payload, {
      onConflict: 'student_id, academic_year, subject_id',
    });

    if (error) setMessage('Error: ' + error.message);
    else setMessage('Real BECE results saved!');
    setSavingReal(false);
  };

  const totalPredicted = subjectList.reduce((sum, sub) => sum + (predictions[sub.id] || 0), 0);
  const totalReal = subjectList.reduce((sum, sub) => sum + (realResults[sub.id] || 0), 0);
  const studentName = students.find(s => s.id === selectedStudent)?.last_name + ' ' + students.find(s => s.id === selectedStudent)?.first_name;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">BECE Tracker</h1>
      <p className="text-gray-500 text-sm -mt-4">Predict BECE results from Mock Exams and compare with real WAEC results</p>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <CanSee module="bece-tracker" section="selectors" element="Student select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Student (JHS 3)</label>
            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[250px]">
              <option value="">-- Select Student --</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="bece-tracker" section="selectors" element="Academic Year input">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
            <input
              type="text"
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-28"
              placeholder="e.g. 2025/2026"
            />
          </div>
        </CanSee>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
      )}

      {selectedStudent && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-3 bg-blue-50 border-b font-medium text-blue-800">
            {studentName} — {allMocks.length} Mock(s) available | Predicted Total: {totalPredicted.toFixed(1)}
          </div>
          <CanSee module="bece-tracker" section="table" element="Predictions">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2">Subject</th>
                  {allMocks.map(m => <th key={m.id} className="text-center px-3 py-2">{m.name}</th>)}
                  <th className="text-center px-3 py-2 bg-blue-50">Predicted</th>
                  <th className="text-center px-3 py-2 bg-green-50">Real BECE</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subjectList.map(sub => {
                  const pred = predictions[sub.id];
                  const real = realResults[sub.id];
                  return (
                    <tr key={sub.id}>
                      <td className="px-4 py-2 font-medium">{sub.name}</td>
                      {allMocks.map(m => {
                        const score = mockResults.find(r => r.mock_exam_id === m.id && r.subject_id === sub.id)?.score;
                        return (
                          <td key={m.id} className="text-center px-3 py-2">
                            {score !== undefined ? score : '—'}
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-2 font-bold bg-blue-50">
                        {pred !== undefined ? pred.toFixed(1) : '—'}
                      </td>
                      <td className="text-center px-3 py-2 bg-green-50">
                        <CanAct module="bece-tracker" section="table" element="Real BECE fields">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={real !== undefined ? real : ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value);
                              setRealResults(prev => ({
                                ...prev,
                                [sub.id]: isNaN(val) ? undefined : val,
                              }));
                            }}
                            className="w-16 text-center border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-300"
                          />
                        </CanAct>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-2 text-right">Total</td>
                  {allMocks.map(m => {
                    const total = subjectList.reduce((sum, sub) => {
                      const s = mockResults.find(r => r.mock_exam_id === m.id && r.subject_id === sub.id)?.score;
                      return sum + (parseFloat(s) || 0);
                    }, 0);
                    return <td key={m.id} className="text-center px-3 py-2">{total.toFixed(1)}</td>;
                  })}
                  <td className="text-center px-3 py-2 bg-blue-50">{totalPredicted.toFixed(1)}</td>
                  <td className="text-center px-3 py-2 bg-green-50">{totalReal.toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>
          </CanSee>
          <div className="p-4 border-t flex justify-end">
            <CanAct module="bece-tracker" section="buttons" element="Save Real BECE">
              <button onClick={handleSaveRealResults} disabled={savingReal} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
                <Save size={16} /> {savingReal ? 'Saving...' : 'Save Real BECE Results'}
              </button>
            </CanAct>
          </div>
        </div>
      )}
    </div>
  );
}