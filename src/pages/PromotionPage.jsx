// src/pages/PromotionPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateTransferCertificate } from '../lib/transferCertificateGenerator';
import { generateCompletionCertificate } from '../lib/completionCertificateGenerator';
import { Save, FileText } from 'lucide-react';

const DECISIONS = ['Promoted', 'Repeat', 'Transferred', 'Withdrawn'];
const DECISION_COLORS = {
  'Promoted':    'bg-green-100 text-green-700',
  'Repeat':      'bg-yellow-100 text-yellow-700',
  'Transferred': 'bg-blue-100 text-blue-700',
  'Withdrawn':   'bg-red-100 text-red-700',
};

export default function PromotionPage() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [decisions, setDecisions] = useState({});          // manuel / final
  const [autoDecisions, setAutoDecisions] = useState({});   // pré-rempli automatiquement
  const [averages, setAverages] = useState({});             // moyennes annuelles
  const [existingDecisions, setExistingDecisions] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [school, setSchool] = useState({ name: '', address: '', phone: '' });
  const [academicYear, setAcademicYear] = useState('2025/2026');

  useEffect(() => {
    supabase.from('classes').select('id, name, level').order('name')
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
    if (!selectedClass) return;
    setLoading(true);
    loadStudentsAndAverages();
  }, [selectedClass, academicYear]);

  const loadStudentsAndAverages = async () => {
    // 1. Élèves actifs de la classe
    const { data: pupils } = await supabase
      .from('students')
      .select('id, first_name, last_name')
      .eq('class_id', selectedClass)
      .eq('active', true)
      .order('last_name');
    setStudents(pupils || []);

    if (!pupils?.length) { setLoading(false); return; }

    // 2. Termes de l'année académique
    const { data: terms } = await supabase
      .from('academic_terms')
      .select('id, term_number')
      .eq('academic_year', academicYear)
      .order('term_number');

    // 3. Matières de la classe pour cette année
    const { data: classSubjects } = await supabase
      .from('class_subjects')
      .select('id, coefficient')
      .eq('class_id', selectedClass)
      .eq('academic_year', academicYear)
      .eq('is_active', true);

    // 4. Pour chaque élève, calculer la moyenne annuelle
    const avgMap = {};
    const autoDecMap = {};

    for (const student of pupils) {
      let termAverages = [];
      for (const term of (terms || [])) {
        const { data: sequences } = await supabase
          .from('assessment_sequences')
          .select('id, weight_percent')
          .eq('term_id', term.id);

        let totalCoeff = 0;
        let weightedSum = 0;
        for (const cs of (classSubjects || [])) {
          const { data: grades } = await supabase
            .from('grades')
            .select('sequence_id, score')
            .eq('student_id', student.id)
            .eq('class_subject_id', cs.id);

          const gradeMap = {};
          (grades || []).forEach(g => { gradeMap[g.sequence_id] = g.score; });

          if ((sequences || []).every(seq => gradeMap[seq.id] !== undefined)) {
            let sum = 0;
            sequences.forEach(seq => { sum += (gradeMap[seq.id] || 0) * (seq.weight_percent / 100); });
            totalCoeff += cs.coefficient;
            weightedSum += sum * cs.coefficient;
          }
        }
        if (totalCoeff > 0) {
          termAverages.push(weightedSum / totalCoeff);
        }
      }

      const annualAvg = termAverages.length > 0
        ? termAverages.reduce((a, b) => a + b, 0) / termAverages.length
        : null;

      avgMap[student.id] = annualAvg;
      // Décision automatique : Promoted si moyenne >= 50, sinon Repeat
      autoDecMap[student.id] = (annualAvg !== null && annualAvg >= 50) ? 'Promoted' : 'Repeat';
    }

    setAverages(avgMap);
    setAutoDecisions(autoDecMap);

    // 5. Charger les décisions existantes (manuel)
    const { data: decs } = await supabase
      .from('promotion_decisions')
      .select('student_id, decision')
      .eq('academic_year', academicYear)
      .in('student_id', pupils.map(s => s.id));

    const existingMap = {};
    (decs || []).forEach(d => { existingMap[d.student_id] = d.decision; });
    setExistingDecisions(existingMap);

    // Initialiser les décisions affichées : priorité au manuel, sinon auto
    const initDecisions = {};
    pupils.forEach(s => {
      initDecisions[s.id] = existingMap[s.id] || autoDecMap[s.id] || '';
    });
    setDecisions(initDecisions);

    setLoading(false);
  };

  const handleDecisionChange = (studentId, decision) => {
    setDecisions(prev => ({ ...prev, [studentId]: decision }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const payload = Object.keys(decisions).map(studentId => ({
      student_id: studentId,
      academic_year: academicYear,
      decision: decisions[studentId],
    }));

    if (payload.length === 0) {
      setMessage('No decisions to save.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('promotion_decisions').upsert(payload, {
      onConflict: 'student_id, academic_year',
    });

    if (error) setMessage('Error: ' + error.message);
    else {
      setMessage('Promotion decisions saved!');
      setExistingDecisions({...decisions});
    }
    setSaving(false);
  };

  const handleCertificate = async (studentId, type) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const className = classes.find(c => c.id === selectedClass)?.name || '';

    if (type === 'transfer') {
      await generateTransferCertificate({
        student: { first_name: student.first_name, last_name: student.last_name, class: className },
        academic_year: academicYear,
        school,
      });
    } else if (type === 'completion') {
      await generateCompletionCertificate({
        student: { first_name: student.first_name, last_name: student.last_name, class: className },
        academic_year: academicYear,
        school,
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Promotion & Certificates</h1>
      <p className="text-gray-500 text-sm -mt-4">
        Automatic pre-fill based on annual average (≥50 = Promoted). You can override any decision.
      </p>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
      )}

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">-- Select Class --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
          <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-28" placeholder="2025/2026" />
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Decisions'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading and computing annual averages...</div>
      ) : selectedClass && students.length > 0 ? (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Student</th>
                <th className="text-center px-4 py-3">Annual Avg.</th>
                <th className="text-center px-4 py-3">Decision</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((s, idx) => {
                const currentDecision = decisions[s.id] || '';
                const annualAvg = averages[s.id];
                const isBelowThreshold = annualAvg !== null && annualAvg < 50;
                const isJhs3 = classes.find(c => c.id === selectedClass)?.name?.startsWith('JHS 3');

                return (
                  <tr key={s.id} className={isBelowThreshold ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2 font-medium">
                      {s.last_name} {s.first_name}
                      {isBelowThreshold && <span className="ml-2 text-xs text-red-600 font-normal">⚠️</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {annualAvg !== null ? annualAvg.toFixed(2) + '%' : 'N/A'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center gap-1">
                        {DECISIONS.map(dec => (
                          <button
                            key={dec}
                            onClick={() => handleDecisionChange(s.id, dec)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                              ${currentDecision === dec ? DECISION_COLORS[dec] + ' shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                          >
                            {dec}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center gap-2">
                        {isJhs3 && currentDecision === 'Promoted' && (
                          <button onClick={() => handleCertificate(s.id, 'completion')}
                            className="text-green-600 hover:text-green-800 text-xs font-medium" title="Certificate of Completion">
                            <FileText size={16} /> Completion
                          </button>
                        )}
                        {currentDecision === 'Transferred' && (
                          <button onClick={() => handleCertificate(s.id, 'transfer')}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium" title="Transfer Certificate">
                            <FileText size={16} /> Transfer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">Select a class to manage promotion decisions.</div>
      )}
    </div>
  );
}