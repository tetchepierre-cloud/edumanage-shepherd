// src/pages/AttendancePage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { generateAttendanceRegisterPDF } from '../lib/attendanceReportGenerator';
import { CanAct, CanSee } from '../components/PermissionGate';
import { sendSMS, formatAbsenceSMS } from '../lib/sms';

const STATUSES = [
  { code: 'P', label: 'Present',  color: 'bg-green-100 text-green-700 border-green-300' },
  { code: 'A', label: 'Absent',   color: 'bg-red-100 text-red-700 border-red-300' },
  { code: 'L', label: 'Late',     color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { code: 'E', label: 'Excused',  color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

export default function AttendancePage() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, late: 0, excused: 0 });

  const [showJustifications, setShowJustifications] = useState(false);
  const [justificationsList, setJustificationsList] = useState([]);

  const [school, setSchool] = useState({ name: '', address: '', phone: '' });

  useEffect(() => {
    fetchClasses();
    loadSchoolInfo();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      loadData(selectedClass, selectedDate);
      loadStats(selectedClass);
    }
  }, [selectedClass]);

  useEffect(() => {
    if (selectedClass) {
      loadStats(selectedClass);
    }
  }, [selectedDate, selectedClass]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('id, name').order('name');
    setClasses(data || []);
    if (data?.length && !selectedClass) setSelectedClass(data[0].id);
  };

  const loadSchoolInfo = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const cfg = {};
    data?.forEach(d => { cfg[d.key] = d.value; });
    setSchool({
      name: cfg.school_name || 'School Name',
      address: cfg.address || '',
      phone: cfg.phone || '',
    });
  };

  const loadData = async (classId, date) => {
    setLoading(true);
    const { data: pupils } = await supabase
      .from('students')
      .select('id, first_name, last_name, parent_phone')
      .eq('class_id', classId)
      .eq('active', true)
      .order('last_name');
    setStudents(pupils || []);

    const { data: atts } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('class_id', classId)
      .eq('date', date);

    const attMap = {};
    (atts || []).forEach(a => { attMap[a.student_id] = a.status; });
    setAttendance(attMap);
    setLoading(false);
  };

  const loadStats = async (classId) => {
    const dateObj = new Date(selectedDate);
    const startOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).toISOString().split('T')[0];
    const endDate = selectedDate;

    const { data: attRecords } = await supabase
      .from('attendance')
      .select('status')
      .eq('class_id', classId)
      .gte('date', startOfMonth)
      .lte('date', endDate);

    if (!attRecords) return;

    const counts = { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
    attRecords.forEach(a => {
      counts.total++;
      if (a.status === 'P') counts.present++;
      else if (a.status === 'A') counts.absent++;
      else if (a.status === 'L') counts.late++;
      else if (a.status === 'E') counts.excused++;
    });

    setStats(counts);
  };

  const fetchJustifications = async () => {
    if (!selectedClass) return;
    const { data: pupils } = await supabase.from('students').select('id').eq('class_id', selectedClass);
    if (!pupils?.length) return;
    const studentIds = pupils.map(s => s.id);

    const { data: justifs } = await supabase
      .from('absence_justifications')
      .select('*, students(first_name, last_name)')
      .in('student_id', studentIds)
      .is('validated_at', null)
      .order('created_at', { ascending: false });
    setJustificationsList(justifs || []);
    setShowJustifications(true);
  };

  const handleStatusChange = (studentId, newStatus) => {
    setAttendance(prev => ({ ...prev, [studentId]: newStatus }));
  };

  const markAllPresent = () => {
    const newAtt = {};
    students.forEach(s => { newAtt[s.id] = 'P'; });
    setAttendance(newAtt);
  };

  const handleSave = async () => {
    if (!selectedClass) return;
    setSaving(true);
    setMessage('');

    try {
      const records = [];
      const absentStudentsToNotify = [];

      for (const student of students) {
        // CORRECTION CRITIQUE : 'P' par défaut pour la base de données
        const status = attendance[student.id] || 'P'; 
        
        records.push({
          student_id: student.id,
          class_id: selectedClass,
          date: selectedDate,
          status,
          period: 'AM',
        });

        // Si on a cliqué sur 'A', on le met dans la liste des SMS
        if (status === 'A') {
          absentStudentsToNotify.push({
            name: `${student.first_name} ${student.last_name}`,
            phone: student.parent_phone,
          });
        }
      }

      // 1. Sauvegarde dans Supabase
      const { error } = await supabase
        .from('attendance')
        .upsert(records, { onConflict: 'student_id, date, period' });

      if (error) throw error;

      // 2. Notifications internes pour l'école (Absences et Retards)
      const notifications = [];
      records.forEach(r => {
        if (r.status === 'A' || r.status === 'L') {
           const s = students.find(x => x.id === r.student_id);
           if (s) {
             notifications.push({
                student_id: s.id,
                notification_type: r.status === 'A' ? 'absence' : 'late',
                message: `${s.first_name} ${s.last_name} was marked ${r.status === 'A' ? 'Absent' : 'Late'} on ${selectedDate}.`,
                attendance_id: null,
             });
           }
        }
      });
      
      if (notifications.length > 0) {
         await supabase.from('attendance_notifications').insert(notifications);
      }

      setMessage('Attendance saved successfully!');

      // 3. Envoi des SMS aux parents concernés (En arrière-plan)
      if (absentStudentsToNotify.length > 0) {
        console.log(`[Système SMS] Traitement de ${absentStudentsToNotify.length} absence(s)...`);
        
        const formattedDate = new Date(selectedDate).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        absentStudentsToNotify.forEach(async (target) => {
          // --- RADAR DE DIAGNOSTIC ---
          if (!target.phone) {
            console.warn(`[Système SMS] ❌ STOP : Aucun numéro pour ${target.name}. La variable contient :`, target.phone);
            return;
          }
          
          try {
            console.log(`[Système SMS] 📡 Tentative d'envoi à ${target.phone} pour ${target.name}...`);
            const smsMessage = formatAbsenceSMS(target.name, formattedDate);
            const result = await sendSMS(target.phone, smsMessage);
            
            if (!result.success) {
              console.error(`[Système SMS] ❌ Échec Hubtel pour ${target.name}:`, result.error);
            } else {
              console.log(`[Système SMS] ✅ Alerte SMS délivrée avec succès à ${target.phone}`);
            }
          } catch (smsErr) {
            console.error(`[Système SMS] ❌ Erreur réseau pour ${target.name}:`, smsErr);
          }
        });
      }

      loadStats(selectedClass);
    } catch (err) {
      console.error('Error saving attendance:', err);
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const absenceRate = stats.total > 0 ? (((stats.absent + stats.late) / stats.total) * 100).toFixed(1) : 0;
  const isHighRisk = parseFloat(absenceRate) > 20;

  const selectedClassObj = classes.find(c => c.id === selectedClass);

  const printMonthlyRegister = async () => {
    if (!selectedClassObj || students.length === 0) return;
    const year = new Date(selectedDate).getFullYear();
    const month = new Date(selectedDate).getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const { data: atts } = await supabase
      .from('attendance')
      .select('student_id, date, status')
      .eq('class_id', selectedClass)
      .gte('date', from)
      .lte('date', to);

    const attendanceMap = {};
    (atts || []).forEach(a => {
      const day = new Date(a.date).getDate();
      if (!attendanceMap[a.student_id]) attendanceMap[a.student_id] = {};
      attendanceMap[a.student_id][String(day)] = a.status;
    });

    generateAttendanceRegisterPDF({
      className: selectedClassObj.name,
      students,
      attendanceMap,
      year,
      month,
      school,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Register</h1>
        <p className="text-gray-500 text-sm mt-1">Daily attendance for teachers and administrators</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <CanSee module="attendance" section="header" element="Class select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </CanSee>
        <CanSee module="attendance" section="header" element="Date select">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
          </div>
        </CanSee>
        <CanAct module="attendance" section="header" element="Mark All Present button">
          <button onClick={markAllPresent} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Mark All Present</button>
        </CanAct>
        <CanAct module="attendance" section="header" element="Justifications button">
          <button onClick={fetchJustifications} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700">Justifications</button>
        </CanAct>
        <CanAct module="attendance" section="header" element="Print Monthly Register">
          <button onClick={printMonthlyRegister} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700">Print Monthly Register</button>
        </CanAct>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Records" value={stats.total} color="bg-gray-100" />
        <StatCard label="Present" value={stats.present} color="bg-green-50 text-green-700" />
        <StatCard label="Absent" value={stats.absent} color="bg-red-50 text-red-700" />
        <StatCard label="Late" value={stats.late} color="bg-yellow-50 text-yellow-700" />
        <StatCard label="Excused" value={stats.excused} color="bg-blue-50 text-blue-700" />
      </div>

      {isHighRisk && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={24} className="text-red-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-red-800">High Absence Alert</p>
            <p className="text-red-700 text-sm">The absence rate in this class is {absenceRate}% (threshold: 20%). Please review the attendance records and contact parents if necessary.</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No active students in this class.</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s, idx) => {
                  const currentStatus = attendance[s.id] !== undefined ? attendance[s.id] : 'P';
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-2 font-medium">{s.last_name} {s.first_name}</td>
                      <td className="px-4 py-2">
                        <CanAct module="attendance" section="grid" element="Status buttons">
                          <div className="flex justify-center gap-1">
                            {STATUSES.map(st => (
                              <button key={st.code} onClick={() => handleStatusChange(s.id, st.code)}
                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${currentStatus === st.code ? st.color + ' shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                                {st.label}
                              </button>
                            ))}
                          </div>
                        </CanAct>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="p-4 border-t flex justify-end">
              <button onClick={handleSave} disabled={saving} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Justifications Modal */}
      {showJustifications && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-96 overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">Absence Justifications (Pending)</h3>
            {justificationsList.length === 0 ? (
              <p className="text-gray-400 text-sm">No pending justifications.</p>
            ) : (
              <ul className="space-y-3">
                {justificationsList.map(j => (
                  <li key={j.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium text-sm">{j.students?.first_name} {j.students?.last_name}</p>
                      <p className="text-xs text-gray-500">{j.reason}</p>
                      {j.document_url && <a href={j.document_url} target="_blank" className="text-blue-500 text-xs underline">View document</a>}
                    </div>
                    <CanAct module="attendance" section="justifications_modal" element="Validate button">
                      <button
                        onClick={async () => {
                          await supabase.from('absence_justifications').update({
                            validated_at: new Date().toISOString(),
                            validated_by: (await supabase.auth.getUser()).data.user?.id || null
                          }).eq('id', j.id);
                          if (j.attendance_id) {
                            await supabase.from('attendance').update({ status: 'E' }).eq('id', j.attendance_id);
                          }
                          setJustificationsList(prev => prev.filter(x => x.id !== j.id));
                        }}
                        className="text-green-600 hover:text-green-800 text-sm font-medium"
                      >
                        <CheckCircle size={16} /> Validate
                      </button>
                    </CanAct>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-right">
              <button onClick={() => setShowJustifications(false)} className="border px-4 py-2 rounded-lg text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`rounded-xl p-3 shadow-sm border ${color}`}>
      <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}