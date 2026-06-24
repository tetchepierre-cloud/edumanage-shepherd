// src/pages/BehaviorPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, ThumbsUp, AlertTriangle } from 'lucide-react';
import { CanAct, CanSee } from '../components/PermissionGate';

const RECORD_TYPES = [
  { value: 'positive', label: 'Positive', icon: ThumbsUp, color: 'bg-green-100 text-green-700' },
  { value: 'negative', label: 'Negative', icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
];

const CATEGORIES = {
  positive: ['Star of the Week', 'Most Improved', 'Helpful', 'Excellent Work', 'Other'],
  negative: ['Warning', 'Detention', 'Suspension', 'Other'],
};

export default function BehaviorPage() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    record_type: 'positive',
    category: 'Star of the Week',
    description: '',
  });
  const [message, setMessage] = useState('');

  useEffect(() => { fetchClasses(); }, []);
  useEffect(() => {
    if (selectedClass) {
      loadStudents(selectedClass);
      loadRecords(selectedClass);
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('id, name').order('sort_order');
    setClasses(data || []);
    if (data?.length && !selectedClass) setSelectedClass(data[0].id);
  };

  const loadStudents = async (classId) => {
    const { data } = await supabase.from('students').select('id, first_name, last_name').eq('class_id', classId).order('last_name');
    setStudents(data || []);
  };

  const loadRecords = async (classId) => {
    setLoading(true);
    const { data } = await supabase
      .from('behavior_records')
      .select('*, students!inner(first_name, last_name)')
      .eq('students.class_id', classId)
      .order('recorded_at', { ascending: false });
    setRecords(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.student_id) return;
    const { error } = await supabase.from('behavior_records').insert({
      student_id: form.student_id,
      teacher_id: null,
      record_type: form.record_type,
      category: form.category,
      description: form.description.trim() || null,
    });
    if (error) {
      setMessage('Error: ' + error.message);
    } else {
      setMessage('Record saved!');
      setShowModal(false);
      setForm({ student_id: '', record_type: 'positive', category: 'Star of the Week', description: '' });
      loadRecords(selectedClass);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this record?')) return;
    await supabase.from('behavior_records').delete().eq('id', id);
    loadRecords(selectedClass);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Behavior Records</h1>
          <p className="text-gray-500 text-sm mt-1">Track positive and negative behaviors</p>
        </div>
        <CanAct module="behavior" section="header" element="Add Record button">
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            <Plus size={16} /> Add Record
          </button>
        </CanAct>
      </div>

      {message && <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>}

      <div className="bg-white rounded-xl shadow p-4">
        <CanSee module="behavior" section="selector" element="Class select">
          <label className="block text-xs font-medium text-gray-500 mb-1">Select Class</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </CanSee>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No behavior records found for this class.</div>
        ) : (
          <CanSee module="behavior" section="table" element="Behavior rows">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map(r => {
                  const TypeIcon = RECORD_TYPES.find(t => t.value === r.record_type)?.icon || ThumbsUp;
                  const typeColor = RECORD_TYPES.find(t => t.value === r.record_type)?.color || '';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.students?.first_name} {r.students?.last_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeColor}`}>
                          <TypeIcon size={12} /> {r.record_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">{r.category}</td>
                      <td className="px-4 py-3 text-gray-600">{r.description || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(r.recorded_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-3">
                        <CanAct module="behavior" section="table" element="Delete button">
                          <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                        </CanAct>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CanSee>
        )}
      </div>

      {showModal && (
        <CanAct module="behavior" section="modal" element="Add/Edit form">
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
              <h3 className="font-semibold text-lg mb-4">Add Behavior Record</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Student</label>
                  <select value={form.student_id} onChange={e => setForm({...form, student_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">-- Select --</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select value={form.record_type} onChange={e => setForm({...form, record_type: e.target.value, category: CATEGORIES[e.target.value][0]})} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {RECORD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {(CATEGORIES[form.record_type] || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional..." />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
                  <button onClick={() => setShowModal(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </CanAct>
      )}
    </div>
  );
}