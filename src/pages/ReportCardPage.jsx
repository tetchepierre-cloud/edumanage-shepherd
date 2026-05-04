// src/pages/ReportCardPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { computeTermReport } from '../lib/gradeCalculations';
import { generateReportCard } from '../lib/reportCardGenerator';
import { Printer } from 'lucide-react';

export default function ReportCardPage() {
  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [school, setSchool] = useState({ name: '', address: '', phone: '' });

  useEffect(() => {
    supabase.from('academic_terms').select('*').eq('is_active', true).order('term_number').then(({ data }) => setTerms(data || []));
    supabase.from('classes').select('id, name').order('name').then(({ data }) => setClasses(data || []));
    loadSchoolInfo();
  }, []);

  const loadSchoolInfo = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const cfg = {};
    data?.forEach(d => { cfg[d.key] = d.value; });
    setSchool({ name: cfg.school_name || 'School', address: cfg.address || '', phone: cfg.phone || '' });
  };

  useEffect(() => {
    if (selectedClass) {
      supabase.from('students').select('id, first_name, last_name').eq('class_id', selectedClass).order('last_name')
        .then(({ data }) => setStudents(data || []));
    }
  }, [selectedClass]);

  const handleCompute = async () => {
    if (!selectedStudent || !selectedTerm) return;
    setLoading(true);
    const rep = await computeTermReport(selectedStudent, selectedTerm);
    setReport(rep);
    setLoading(false);
  };

  const handlePrint = async () => {
    if (!report || !selectedStudent || !selectedTerm) return;
    const term = terms.find(t => t.id === selectedTerm);
    if (!term) return;

    // Récupérer les infos complètes de l'élève (avec date_of_birth)
    const { data: fullStudent } = await supabase
      .from('students')
      .select('first_name, last_name, date_of_birth')
      .eq('id', selectedStudent)
      .single();

    generateReportCard({
      student: {
        first_name: fullStudent?.first_name || '—',
        last_name:  fullStudent?.last_name  || '—',
        class:      classes.find(c => c.id === selectedClass)?.name || '',
        date_of_birth: fullStudent?.date_of_birth || '',
      },
      report,
      term,
      school,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Report Cards</h1>
      <p className="text-gray-500 text-sm -mt-4">Compute term averages and generate terminal reports</p>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Term</label>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
            <option value="">-- Select Term --</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name} ({t.academic_year})</option>)}
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
          <label className="block text-xs font-medium text-gray-500 mb-1">Student</label>
          <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">-- Select Student --</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>)}
          </select>
        </div>
        <button onClick={handleCompute} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Compute</button>
      </div>

      {loading && <div className="text-center py-4 text-gray-500">Computing averages...</div>}

      {report && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h2 className="font-semibold">{students.find(s => s.id === selectedStudent)?.last_name} {students.find(s => s.id === selectedStudent)?.first_name}</h2>
            <button onClick={handlePrint} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
              <Printer size={16} /> Print Report Card
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-center px-4 py-3">Mid-Term</th>
                <th className="text-center px-4 py-3">End-Term</th>
                <th className="text-center px-4 py-3">Average</th>
                <th className="text-center px-4 py-3">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.subjects.map((sub, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2">{sub.subjectName}</td>
                  <td className="px-4 py-2 text-center">{sub.midTermScore ?? '—'}</td>
                  <td className="px-4 py-2 text-center">{sub.endTermScore ?? '—'}</td>
                  <td className="px-4 py-2 text-center font-medium">{sub.average !== null ? sub.average.toFixed(1) : '—'}</td>
                  <td className="px-4 py-2 text-center">{sub.average !== null ? getGrade(sub.average) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right">Overall Average</td>
                <td className="px-4 py-2 text-center">{report.overallAverage !== null ? report.overallAverage.toFixed(2) + '%' : 'N/A'}</td>
              </tr>
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right">Grade</td>
                <td className="px-4 py-2 text-center">{report.grade || 'N/A'}</td>
              </tr>
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right">Rank</td>
                <td className="px-4 py-2 text-center">{report.rank ?? 'N/A'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function getGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}