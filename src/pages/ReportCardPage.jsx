// src/pages/ReportCardPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { computeTermReport } from '../lib/gradeCalculations';
import { generateReportCard } from '../lib/reportCardGenerator';
import { generateKgReportCard } from '../lib/kgReportCardGenerator';
import { Printer } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

const RUBRIC_LABELS = { 'E': 'Emerging', 'D': 'Developing', 'A': 'Achieving', 'Ex': 'Extending' };
const RUBRIC_COLORS = {
  'E': 'bg-red-100 text-red-700',
  'D': 'bg-yellow-100 text-yellow-700',
  'A': 'bg-blue-100 text-blue-700',
  'Ex': 'bg-green-100 text-green-700',
};

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

  const [kgPreview, setKgPreview] = useState(null);

  useEffect(() => {
    supabase.from('academic_terms').select('*').eq('is_active', true).order('term_number')
      .then(({ data }) => setTerms(data || []));
    supabase.from('classes').select('id, name').order('name')
      .then(({ data }) => setClasses(data || []));
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

  const isKgClass = () => {
    const cls = classes.find(c => c.id === selectedClass);
    return cls?.level === 'KG';
  };

  const loadKgPreview = async (studentId, termId) => {
    const { data: student } = await supabase
      .from('students')
      .select('first_name, last_name, date_of_birth')
      .eq('id', studentId)
      .maybeSingle();

    const { data: assessments } = await supabase
      .from('kg_assessments')
      .select('domain, rubric')
      .eq('student_id', studentId)
      .eq('term_id', termId);

    const { data: termData } = await supabase
      .from('academic_terms')
      .select('start_date, end_date')
      .eq('id', termId)
      .maybeSingle();

    let attendance = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    if (termData) {
      const { data: atts } = await supabase
        .from('attendance')
        .select('status')
        .eq('student_id', studentId)
        .gte('date', termData.start_date)
        .lte('date', termData.end_date);
      (atts || []).forEach(a => {
        attendance.total++;
        if (a.status === 'P') attendance.present++;
        else if (a.status === 'A') attendance.absent++;
        else if (a.status === 'L') attendance.late++;
        else if (a.status === 'E') attendance.excused++;
      });
    }

    setKgPreview({ student, assessments: assessments || [], attendance });
  };

  const handleCompute = async () => {
    if (!selectedStudent || !selectedTerm) return;
    setLoading(true);
    setKgPreview(null);
    setReport(null);

    if (isKgClass()) {
      await loadKgPreview(selectedStudent, selectedTerm);
    } else {
      const rep = await computeTermReport(selectedStudent, selectedTerm);
      setReport(rep);
    }
    setLoading(false);
  };

  const handlePrint = async () => {
    if (!selectedStudent || !selectedTerm) return;
    const term = terms.find(t => t.id === selectedTerm);
    if (!term) return;

    if (isKgClass()) {
      const className = classes.find(c => c.id === selectedClass)?.name || '';
      await generateKgReportCard({
        studentId: selectedStudent,
        termId: selectedTerm,
        className,
        school,
      });
    } else {
      const { data: fullStudent } = await supabase
        .from('students')
        .select('first_name, last_name, date_of_birth')
        .eq('id', selectedStudent)
        .maybeSingle();

      const rep = await computeTermReport(selectedStudent, selectedTerm);

      generateReportCard({
        student: {
          first_name: fullStudent?.first_name || '—',
          last_name:  fullStudent?.last_name  || '—',
          class:      classes.find(c => c.id === selectedClass)?.name || '',
          date_of_birth: fullStudent?.date_of_birth || '',
        },
        report: rep,
        term,
        school,
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Terminal Reports</h1>
      <p className="text-gray-500 text-sm -mt-4">Compute term averages and generate terminal reports</p>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <CanSee module="report-cards" section="header" element="Term select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Term</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              <option value="">-- Select Term --</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name} ({t.academic_year})</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="report-cards" section="header" element="Class select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              <option value="">-- Select Class --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="report-cards" section="header" element="Student select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Student</label>
            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
              <option value="">-- Select Student --</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>)}
            </select>
          </div>
        </CanSee>
        <CanAct module="report-cards" section="header" element="Compute button">
          <button onClick={handleCompute} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Compute</button>
        </CanAct>
        <CanAct module="report-cards" section="header" element="Print Terminal Report">
          <button onClick={handlePrint} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
            <Printer size={16} /> Print Terminal Report
          </button>
        </CanAct>
      </div>

      {loading && <div className="text-center py-4 text-gray-500">Computing...</div>}

      {/* Prévisualisation KG */}
      {kgPreview && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-blue-50">
            <h2 className="font-semibold text-lg">
              {kgPreview.student?.last_name} {kgPreview.student?.first_name}
            </h2>
            <p className="text-xs text-gray-500">
              Class: {classes.find(c => c.id === selectedClass)?.name || ''} · Term: {terms.find(t => t.id === selectedTerm)?.name || ''}
            </p>
          </div>
          <div className="p-4">
            <h3 className="font-medium text-gray-700 mb-2">Learning Domains</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2">Domain</th>
                  <th className="text-center px-4 py-2">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {kgPreview.assessments.map((a, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{a.domain}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RUBRIC_COLORS[a.rubric] || 'bg-gray-100'}`}>
                        {RUBRIC_LABELS[a.rubric] || a.rubric}
                      </span>
                    </td>
                  </tr>
                ))}
                {kgPreview.assessments.length === 0 && (
                  <tr><td colSpan={2} className="text-center py-4 text-gray-400">No assessments recorded for this term.</td></tr>
                )}
              </tbody>
            </table>
            <h3 className="font-medium text-gray-700 mt-6 mb-2">Attendance</h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-2 text-center"><span className="block text-xs text-gray-500">Present</span><span className="font-bold">{kgPreview.attendance.present}</span></div>
              <div className="bg-gray-50 rounded p-2 text-center"><span className="block text-xs text-gray-500">Absent</span><span className="font-bold">{kgPreview.attendance.absent}</span></div>
              <div className="bg-gray-50 rounded p-2 text-center"><span className="block text-xs text-gray-500">Late</span><span className="font-bold">{kgPreview.attendance.late}</span></div>
              <div className="bg-gray-50 rounded p-2 text-center"><span className="block text-xs text-gray-500">Excused</span><span className="font-bold">{kgPreview.attendance.excused}</span></div>
              <div className="bg-gray-50 rounded p-2 text-center"><span className="block text-xs text-gray-500">Total</span><span className="font-bold">{kgPreview.attendance.total}</span></div>
              <div className="bg-gray-50 rounded p-2 text-center"><span className="block text-xs text-gray-500">Rate</span><span className="font-bold">{kgPreview.attendance.total > 0 ? ((kgPreview.attendance.present / kgPreview.attendance.total) * 100).toFixed(1) + '%' : 'N/A'}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Prévisualisation Primary/JHS */}
      {report && !isKgClass() && (
        <CanSee module="report-cards" section="preview" element="Grades table">
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="font-semibold">
                {students.find(s => s.id === selectedStudent)?.last_name} {students.find(s => s.id === selectedStudent)?.first_name}
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">SUBJECT</th>
                  <th className="text-center px-4 py-3">S.B.A (50)</th>
                  <th className="text-center px-4 py-3">EXAM (50)</th>
                  <th className="text-center px-4 py-3">TOTAL (100)</th>
                  <th className="text-center px-4 py-3">GRADE</th>
                  <th className="text-center px-4 py-3">POS</th>
                  <th className="text-center px-4 py-3">REMARKS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.subjects?.map((sub, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2">{sub.subjectName}</td>
                    <td className="px-4 py-2 text-center">{sub.midTermScore ?? '—'}</td>
                    <td className="px-4 py-2 text-center">{sub.endTermScore ?? '—'}</td>
                    <td className="px-4 py-2 text-center font-medium">{sub.average !== null ? sub.average.toFixed(1) : '—'}</td>
                    <td className="px-4 py-2 text-center">{sub.average !== null ? sub.gradeLetter : '—'}</td>
                    <td className="px-4 py-2 text-center">{sub.pos ?? '—'}</td>
                    <td className="px-4 py-2 text-center">{sub.remarks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right">Total (all subjects)</td>
                  <td className="px-4 py-2 text-center">{report.totalAllSubjects?.toFixed(1) ?? '—'}</td>
                  <td colSpan={3}></td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right">Average</td>
                  <td className="px-4 py-2 text-center">{report.overallAverage?.toFixed(2) ?? '—'}</td>
                  <td colSpan={3}></td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right">Position (all subjects)</td>
                  <td className="px-4 py-2 text-center">{report.rank ?? '—'}</td>
                  <td colSpan={3}></td>
                </tr>
                <tr>
                  <td colSpan={7} className="px-4 py-2">
                    <p><strong>A = ADVANCED</strong> &nbsp; P = PROFICIENT &nbsp; AP = APPROACHING PROFICIENCY &nbsp; D = DEVELOPING &nbsp; B = BEGINNING</p>
                    <p className="mt-2"><strong>Class teachers' remarks:</strong></p>
                    <p className="italic">(aucune remarque inscrite)</p>
                    <p className="mt-2"><strong>Signature/stamp</strong></p>
                    <p className="mt-2"><strong>School Director</strong></p>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CanSee>
      )}
    </div>
  );
}