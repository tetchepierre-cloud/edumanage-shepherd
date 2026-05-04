// src/pages/TimetablePage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateTimetablePDF } from '../lib/timetableGenerator';
import { Plus, Trash2, AlertTriangle, Printer, Users, Calendar } from 'lucide-react';

const DAYS_OF_WEEK = [
  { idx: 1, label: 'Monday', short: 'Mon' },
  { idx: 2, label: 'Tuesday', short: 'Tue' },
  { idx: 3, label: 'Wednesday', short: 'Wed' },
  { idx: 4, label: 'Thursday', short: 'Thu' },
  { idx: 5, label: 'Friday', short: 'Fri' },
  { idx: 6, label: 'Saturday', short: 'Sat' },
  { idx: 7, label: 'Sunday', short: 'Sun' },
];

const DEFAULT_PERIODS = [
  { number: 1, label: '1', time: '08:00 - 08:45' },
  { number: 2, label: '2', time: '08:45 - 09:30' },
  { number: 3, label: '3', time: '09:30 - 10:15' },
  { number: 4, label: '4', time: '10:15 - 11:00' },
  { number: 5, label: '5', time: '11:30 - 12:15' },
  { number: 6, label: '6', time: '12:15 - 13:00' },
  { number: 7, label: '7', time: '13:00 - 13:45' },
  { number: 8, label: '8', time: '13:45 - 14:30' },
];

const GES_MIN_HOURS = {
  KG: { default: 2 },
  Primary: {
    ENG: 5, MATH: 5, GHL: 3, OWE: 3, SCI: 3, SST: 3, RME: 2, CRA: 2, PE: 2, ICT: 2, FRE: 2
  },
  JHS: {
    ENG: 5, MATH: 5, SCI: 4, SST: 4, GHL: 3, RME: 3, CRA: 3, CART: 3, PE: 2, ICT: 2, FRE: 2
  },
};

export default function TimetablePage() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [classSubjects, setClassSubjects] = useState([]);
  const [slots, setSlots] = useState([]);
  const [allSlots, setAllSlots] = useState([]);
  const [teacherList, setTeacherList] = useState([]);
  const [viewMode, setViewMode] = useState('class');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [school, setSchool] = useState({ name: '', address: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [form, setForm] = useState({ day_of_week: 1, period_number: 1, class_subject_id: '' });

  useEffect(() => {
    fetchClasses();
    loadSchoolConfig();
    loadAllSlots();
    fetchTeachers();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchClassSubjects(selectedClass);
      fetchSlots(selectedClass);
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('id, name').order('name');
    setClasses(data || []);
    if (data?.length && !selectedClass) setSelectedClass(data[0].id);
  };

  const loadSchoolConfig = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const cfg = {};
    data?.forEach(d => { cfg[d.key] = d.value; });
    setSchool({ name: cfg.school_name || 'School', address: cfg.address || '' });
  };

  const loadAllSlots = async () => {
    const { data } = await supabase
      .from('timetable_slots')
      .select('*, class_subjects(*, subjects(*), staff(*)), classes(name)');
    setAllSlots(data || []);
  };

  const fetchTeachers = async () => {
    const { data } = await supabase
      .from('staff')
      .select('id, first_name, last_name')
      .eq('active', true)
      .order('last_name');
    setTeacherList(data || []);
  };

  const fetchClassSubjects = async (classId) => {
    const { data } = await supabase
      .from('class_subjects')
      .select('id, coefficient, subject_id, teacher_id, subjects(name, code, cycle), staff(first_name, last_name)')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('subject_id');
    setClassSubjects(data || []);
  };

  const fetchSlots = async (classId) => {
    const { data } = await supabase
      .from('timetable_slots')
      .select('*, class_subjects(*, subjects(*), staff(*))')
      .eq('class_id', classId)
      .order('period_number');
    setSlots(data || []);
  };

  const openAddSlot = (day, period) => {
    setEditingSlot(null);
    setForm({ day_of_week: day, period_number: period, class_subject_id: '' });
    setShowModal(true);
  };

  const openEditSlot = (slot) => {
    setEditingSlot(slot);
    setForm({
      day_of_week: slot.day_of_week,
      period_number: slot.period_number,
      class_subject_id: slot.class_subject_id,
    });
    setShowModal(true);
  };

  const handleSaveSlot = async () => {
    if (!form.class_subject_id) return;
    const payload = {
      class_id: selectedClass,
      day_of_week: form.day_of_week,
      period_number: form.period_number,
      class_subject_id: form.class_subject_id,
    };
    if (editingSlot) {
      await supabase.from('timetable_slots').update(payload).eq('id', editingSlot.id);
    } else {
      await supabase.from('timetable_slots').insert(payload);
    }
    setShowModal(false);
    fetchSlots(selectedClass);
    loadAllSlots();
  };

  const handleDeleteSlot = async (id) => {
    if (!confirm('Delete this slot?')) return;
    await supabase.from('timetable_slots').delete().eq('id', id);
    fetchSlots(selectedClass);
    loadAllSlots();
  };

  const isTeacherBusy = (teacherId, day, period) => {
    return allSlots.some(s =>
      s.class_subjects?.teacher_id === teacherId &&
      s.day_of_week === day &&
      s.period_number === period &&
      s.class_id !== selectedClass
    );
  };

  const subjectPeriodCount = {};
  slots.forEach(s => {
    if (s.class_subjects?.subject_id) {
      const id = s.class_subjects.subject_id;
      subjectPeriodCount[id] = (subjectPeriodCount[id] || 0) + 1;
    }
  });

  const getSubjectMinHours = (subject) => {
    const cycle = subject.subjects?.cycle || 'KG';
    const code = subject.subjects?.code || '';
    const map = GES_MIN_HOURS[cycle] || GES_MIN_HOURS['KG'];
    return map[code] || map['default'] || 2;
  };

  const selectedClassObj = classes.find(c => c.id === selectedClass);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timetable</h1>
          <p className="text-gray-500 text-sm mt-1">Manage class and teacher schedules</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('class')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${viewMode === 'class' ? 'bg-blue-600 text-white' : 'bg-white border'}`}
          ><Calendar size={16} className="inline mr-1" /> Classes</button>
          <button
            onClick={() => setViewMode('teacher')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${viewMode === 'teacher' ? 'bg-blue-600 text-white' : 'bg-white border'}`}
          ><Users size={16} className="inline mr-1" /> Teachers</button>
        </div>
      </div>

      {viewMode === 'class' && (
        <>
          <div className="bg-white rounded-xl shadow p-4 flex gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Select Class</label>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm min-w-[200px]"
              >
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => generateTimetablePDF({
                className: selectedClassObj?.name || 'Class',
                slots,
                school,
                periods: DEFAULT_PERIODS,
              })}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              <Printer size={16} /> Print PDF
            </button>
          </div>

          {/* Volume horaire warnings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {classSubjects.map(cs => {
              const count = subjectPeriodCount[cs.subject_id] || 0;
              const min = getSubjectMinHours(cs);
              const isLow = count < min;
              return (
                <div key={cs.id} className={`rounded-lg p-3 text-sm ${isLow ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                  <span className="font-medium">{cs.subjects?.name}</span>
                  <span className="ml-2 text-xs">{count} / {min} periods</span>
                  {isLow && <AlertTriangle size={14} className="inline text-red-500 ml-1" />}
                </div>
              );
            })}
          </div>

          {/* Timetable Grid */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left font-semibold text-gray-600">Period</th>
                    {DAYS_OF_WEEK.map(d => (
                      <th key={d.idx} className="border p-2 text-center font-semibold text-gray-600">{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEFAULT_PERIODS.map(period => (
                    <tr key={period.number}>
                      <td className="border p-2 text-xs text-gray-500">
                        <strong>{period.label}</strong><br/>{period.time}
                      </td>
                      {DAYS_OF_WEEK.map(day => {
                        const slot = slots.find(s => s.day_of_week === day.idx && s.period_number === period.number);
                        const subjectName = slot?.class_subjects?.subjects?.name;
                        const teacherName = slot?.class_subjects?.staff
                          ? `${slot.class_subjects.staff.first_name?.charAt(0)}. ${slot.class_subjects.staff.last_name}`
                          : '';
                        const hasConflict = slot && isTeacherBusy(slot.class_subjects?.teacher_id, day.idx, period.number);
                        return (
                          <td
                            key={day.idx}
                            className={`border p-2 text-center cursor-pointer transition-colors ${hasConflict ? 'bg-red-100 hover:bg-red-200' : 'hover:bg-blue-50'}`}
                            onClick={() => slot ? openEditSlot(slot) : openAddSlot(day.idx, period.number)}
                          >
                            {slot ? (
                              <>
                                <div className="font-medium text-xs">{subjectName}</div>
                                {teacherName && <div className="text-xs text-gray-500">{teacherName}</div>}
                                {hasConflict && <AlertTriangle size={12} className="text-red-500 inline ml-1" />}
                              </>
                            ) : (
                              <span className="text-gray-300 text-xl">+</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {viewMode === 'teacher' && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Teacher Schedule</h3>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Select Teacher</label>
            <select
              value={selectedTeacher}
              onChange={e => setSelectedTeacher(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">-- Select --</option>
              {teacherList.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </select>
          </div>
          {selectedTeacher && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2">Period</th>
                    {DAYS_OF_WEEK.map(d => <th key={d.idx} className="border p-2">{d.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DEFAULT_PERIODS.map(period => {
                    const rowSlots = allSlots.filter(s => s.class_subjects?.teacher_id === selectedTeacher && s.period_number === period.number);
                    return (
                      <tr key={period.number}>
                        <td className="border p-2 text-xs">{period.label}</td>
                        {DAYS_OF_WEEK.map(day => {
                          const slot = rowSlots.find(s => s.day_of_week === day.idx);
                          return (
                            <td key={day.idx} className="border p-2 text-xs">
                              {slot ? (
                                <div>
                                  <div className="font-medium">{slot.class_subjects?.subjects?.name}</div>
                                  <div className="text-gray-500">Class: {slot.classes?.name || '?'}</div>
                                </div>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">{editingSlot ? 'Edit Slot' : 'Add Slot'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Day</label>
                <select
                  value={form.day_of_week}
                  onChange={e => setForm({...form, day_of_week: parseInt(e.target.value)})}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {DAYS_OF_WEEK.map(d => <option key={d.idx} value={d.idx}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Period</label>
                <select
                  value={form.period_number}
                  onChange={e => setForm({...form, period_number: parseInt(e.target.value)})}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {DEFAULT_PERIODS.map(p => <option key={p.number} value={p.number}>{p.label} ({p.time})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Subject / Teacher</label>
                <select
                  value={form.class_subject_id}
                  onChange={e => setForm({...form, class_subject_id: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">-- Select --</option>
                  {classSubjects.map(cs => (
                    <option key={cs.id} value={cs.id}>
                      {cs.subjects?.name} — {cs.staff ? `${cs.staff.first_name} ${cs.staff.last_name}` : 'Unassigned'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveSlot} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
                {editingSlot && (
                  <button onClick={() => { handleDeleteSlot(editingSlot.id); setShowModal(false); }} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm">Delete</button>
                )}
                <button onClick={() => setShowModal(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}