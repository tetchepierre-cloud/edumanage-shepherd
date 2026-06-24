// src/pages/ClassListPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateClassListPDF } from '../lib/classListGenerator';
import { Download, FileText } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

export default function ClassListPage() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [school, setSchool] = useState({
    name: 'School Name',
    address: 'Address',
    phone: '',
    email: '',
  });

  useEffect(() => {
    fetchClasses();
    loadSchoolConfig();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      loadStudents(selectedClass);
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase.from('classes').select('id, name').order('sort_order');
      if (error) console.error('fetchClasses error:', error);
      setClasses(data || []);
      if (data && data.length > 0 && !selectedClass) {
        setSelectedClass(data[0].id);
      }
    } catch (err) {
      console.error('fetchClasses exception:', err);
    }
  };

  const loadSchoolConfig = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const config = {};
    data?.forEach(d => { config[d.key] = d.value; });
    setSchool({
      name: config.school_name || 'EduManage School',
      address: config.address || 'Tamale, Ghana',
      phone: config.phone || '',
      email: config.email || '',
      logo: config.logo || null,
    });
  };

  const loadStudents = async (classId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('id, first_name, last_name, gender, date_of_birth, parent_name, parent_phone, active')
      .eq('class_id', classId)
      .order('last_name');
    if (error) {
      console.error(error);
      setStudents([]);
    } else {
      setStudents(data || []);
    }
    setLoading(false);
  };

  const exportCSV = () => {
    const headers = ['No.', 'Full Name', 'Gender', 'Date of Birth', 'Parent/Guardian', 'Phone'];
    const rows = students.map((s, idx) => [
      idx + 1,
      `${s.last_name} ${s.first_name}`,
      s.gender || '',
      s.date_of_birth || '',
      s.parent_name || '',
      s.parent_phone || '',
    ]);
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += headers.join(',') + '\n';
    rows.forEach(row => csvContent += row.join(',') + '\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Class_List_${selectedClassName()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedClassName = () => {
    const cls = classes.find(c => c.id === selectedClass);
    return cls ? cls.name : 'Class';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Class List (Official)</h1>
          <p className="text-gray-500 text-sm mt-1">Generate and export official class lists</p>
        </div>
        <div className="flex gap-2">
          <CanAct module="class-list" section="header" element="PDF button">
            <button
              onClick={async () => { await generateClassListPDF({ className: selectedClassName(), students, school }); }}
              disabled={students.length === 0}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              <FileText size={16} /> PDF
            </button>
          </CanAct>
          <CanAct module="class-list" section="header" element="CSV button">
            <button
              onClick={exportCSV}
              disabled={students.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              <Download size={16} /> CSV
            </button>
          </CanAct>
        </div>
      </div>

      {/* Sélection de classe */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <CanSee module="class-list" section="selector" element="Class select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Select Class</label>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            >
              <option value="">-- Choose a class --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </CanSee>
        {selectedClass && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 font-medium">
            Class: {selectedClassName()} | Pupils: {students.length}
          </div>
        )}
      </div>

      {/* Tableau des élèves */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-500">Loading students...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>No students found in this class.</p>
          </div>
        ) : (
          <CanSee module="class-list" section="table" element="Student list">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">No.</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Full Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Gender</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Date of Birth</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Parent / Guardian</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((student, idx) => (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{student.last_name} {student.first_name}</td>
                      <td className="px-4 py-3">{student.gender || '—'}</td>
                      <td className="px-4 py-3">{student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString('en-GB') : '—'}</td>
                      <td className="px-4 py-3">{student.parent_name || '—'}</td>
                      <td className="px-4 py-3">{student.parent_phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CanSee>
        )}
      </div>
    </div>
  );
}