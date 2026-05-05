// src/pages/GesReportPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateGesReport } from '../lib/gesReportGenerator';
import { FileText } from 'lucide-react';

const ACADEMIC_YEARS = ['2024/2025', '2025/2026', '2026/2027'];

export default function GesReportPage() {
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [school, setSchool] = useState({ name: '', address: '', phone: '' });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('*').then(({ data }) => {
      const cfg = {};
      data?.forEach(d => { cfg[d.key] = d.value; });
      setSchool({
        name: cfg.school_name || 'School Name',
        address: cfg.address || '',
        phone: cfg.phone || '',
      });
    });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    await generateGesReport({ academicYear, school });
    setGenerating(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">GES Annual Statistical Report</h1>
      <p className="text-gray-500 text-sm -mt-4">
        Generate the official statistical report required by the Ghana Education Service. Includes enrolment, attendance, BECE performance, and staff summary.
      </p>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
          <select value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-40">
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <strong>What this report includes:</strong>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>Enrolment by class and gender</li>
            <li>Attendance summary per term (Present / Absent / Late / Excused)</li>
            <li>BECE performance for JHS 3 (if results are entered)</li>
            <li>Active staff count by position and gender</li>
          </ul>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <FileText size={18} />
          {generating ? 'Generating...' : 'Generate GES Report (PDF)'}
        </button>
      </div>
    </div>
  );
}