// src/pages/ReportCardPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { computeTermReport } from '../lib/gradeCalculations';
import { generateReportCard } from '../lib/reportCardGenerator';
import { Printer } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

// Ordre des niveaux pour la promotion
const LEVEL_ORDER = [
  'Nursery 1', 'Nursery 2',
  'KG 1', 'KG 2',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JHS 1', 'JHS 2'
];

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

  // États pour l'assiduité manuelle et la promotion
  const [totalSchoolDays, setTotalSchoolDays] = useState(65);
  const [absences, setAbsences] = useState('');
  const [promotedTo, setPromotedTo] = useState('');

  // Toutes les classes pour la sélection des niveaux
  const [allClasses, setAllClasses] = useState([]);

  useEffect(() => {
    supabase.from('academic_terms').select('*').eq('is_active', true).order('term_number')
      .then(({ data }) => setTerms(data || []));

    // Charger toutes les classes pour la promotion
    supabase.from('classes').select('id, name, level, sort_order').order('sort_order', { ascending: true })
      .then(({ data }) => setAllClasses(data || []));

    supabase.from('classes').select('id, name, level').order('sort_order', { ascending: true })
      .then(({ data }) => {
        console.log('🔍 Données brutes des classes :', data);
        const primaryJhsClasses = (data || []).filter(c => 
          c.name && (c.name.includes('Primary') || c.name.includes('JHS'))
        );
        console.log('🔍 Classes filtrées (Primary/JHS) :', primaryJhsClasses);
        setClasses(primaryJhsClasses);
      });
      
    loadSchoolInfo();
  }, []);

  const loadSchoolInfo = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const cfg = {};
    data?.forEach(d => { cfg[d.key] = d.value; });
    const signature = cfg.school_manager_signature || null;
    setSchool({
      name:    cfg.school_name || 'School',
      address: cfg.address     || '',
      phone:   cfg.phone       || '',
      email:   cfg.email       || '',
      logo:    cfg.logo        || null,
      vacationStart: cfg.vacation_start_date || '',
      resumption:   cfg.resumption_date     || '',
      signature: signature
    });
    setTotalSchoolDays(parseInt(cfg.total_school_days) || 65);
  };

  useEffect(() => {
    const fetchStudents = async () => {
      if (!selectedClass) {
        setStudents([]);
        return;
      }
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('class_id', selectedClass)
        .order('last_name');

      if (error) {
        console.error("🚨 Erreur Supabase (Étudiants) :", error.message);
        return;
      }
      setStudents(data || []);
    };
    fetchStudents();
  }, [selectedClass]);

  // ── Extraire le niveau d'un nom de classe ──
  const extractLevelFromClassName = (className) => {
    if (!className) return '';
    const parts = className.trim().split(' ');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 1 && lastPart >= 'A' && lastPart <= 'Z') {
      return parts.slice(0, parts.length - 1).join(' ');
    }
    return className;
  };

  // ── Obtenir les options de promotion (niveaux supérieurs) ──
  const getPromotionOptions = () => {
    if (!selectedClass) return [];
    const currentClass = allClasses.find(c => c.id === selectedClass);
    if (!currentClass) return [];
    const levelName = extractLevelFromClassName(currentClass.name);
    if (!levelName) return [];
    const currentIndex = LEVEL_ORDER.indexOf(levelName);
    if (currentIndex === -1) return [];
    return LEVEL_ORDER.filter((_, index) => index > currentIndex);
  };

  const promotionOptions = getPromotionOptions();

  const handleCompute = async () => {
    if (!selectedStudent || !selectedTerm) return;
    setLoading(true);
    setReport(null);
    const rep = await computeTermReport(selectedStudent, selectedTerm);
    setReport(rep);
    setLoading(false);
  };

  const handlePrint = async () => {
    if (!selectedStudent || !selectedTerm) return;
    const term = terms.find(t => t.id === selectedTerm);
    if (!term) return;

    const { data: fullStudent } = await supabase
      .from('students')
      .select('first_name, last_name, date_of_birth')
      .eq('id', selectedStudent)
      .maybeSingle();

    const rep = await computeTermReport(selectedStudent, selectedTerm);

    const total = parseInt(totalSchoolDays) || 0;
    const absent = parseInt(absences) || 0;
    const present = Math.max(0, total - absent);
    const attendanceData = { present, absent, total };

    // Nombre d'élèves dans la classe – directement depuis le state students
    const currentNumberOnRoll = students.length;

    generateReportCard({
      student: {
        first_name: fullStudent?.first_name || '—',
        last_name:  fullStudent?.last_name  || '—',
        class:      classes.find(c => c.id === selectedClass)?.name || '',
        date_of_birth: fullStudent?.date_of_birth || '',
      },
      report: {
        ...rep,
        attendance: attendanceData,
        promotedTo: promotedTo || '',
        numberOnRoll: currentNumberOnRoll,
      },
      term,
      school,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Primary / JHS Reports</h1>
      <p className="text-gray-500 text-sm -mt-4">Compute term averages and generate terminal reports for Primary and JHS</p>

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

        {/* Assiduité manuelle */}
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">School Days</label>
            <input type="number" min="1" value={totalSchoolDays} readOnly className="border rounded px-2 py-1.5 text-sm w-20 bg-gray-100 cursor-default" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Absences</label>
            <input type="number" min="0" value={absences} onChange={e => setAbsences(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-16" />
          </div>
        </div>

        {/* Promotion avec sélecteur de niveaux supérieurs */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Promoted to</label>
          <select
            value={promotedTo}
            onChange={e => setPromotedTo(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-32 bg-white"
          >
            <option value="">-- Select --</option>
            {promotionOptions.map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>

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

      {report && (
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
                  {classes.find(c => c.id === selectedClass)?.level === 'JHS' ? (
                    <>
                      <th className="text-center px-4 py-3">CLASS (30)</th>
                      <th className="text-center px-4 py-3">EXAM (70)</th>
                    </>
                  ) : (
                    <>
                      <th className="text-center px-4 py-3">S.B.A (50)</th>
                      <th className="text-center px-4 py-3">EXAM (50)</th>
                    </>
                  )}
                  <th className="text-center px-4 py-3">TOTAL (100)</th>
                  <th className="text-center px-4 py-3">GRADE</th>
                  <th className="text-center px-4 py-3">POS</th>
                  <th className="text-center px-4 py-3">REMARKS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.subjects?.map((sub, idx) => {
                  const isJhs = classes.find(c => c.id === selectedClass)?.level === 'JHS';
                  let midDisplay = '—';
                  let endDisplay = '—';
                  if (sub.midTermScore !== null && sub.midTermScore !== undefined) {
                    midDisplay = isJhs ? (sub.midTermScore * 0.3).toFixed(1) : (sub.midTermScore / 2).toFixed(1);
                  }
                  if (sub.endTermScore !== null && sub.endTermScore !== undefined) {
                    endDisplay = isJhs ? (sub.endTermScore * 0.7).toFixed(1) : (sub.endTermScore / 2).toFixed(1);
                  }
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-2">{sub.subjectName}</td>
                      <td className="px-4 py-2 text-center">{midDisplay}</td>
                      <td className="px-4 py-2 text-center">{endDisplay}</td>
                      <td className="px-4 py-2 text-center font-medium">{sub.average !== null ? sub.average.toFixed(1) : '—'}</td>
                      <td className="px-4 py-2 text-center">{sub.average !== null ? sub.gradeLetter : '—'}</td>
                      <td className="px-4 py-2 text-center">{sub.pos ?? '—'}</td>
                      <td className="px-4 py-2 text-center">{sub.remarks ?? '—'}</td>
                    </tr>
                  );
                })}
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
              </tfoot>
            </table>
          </div>
        </CanSee>
      )}
    </div>
  );
}