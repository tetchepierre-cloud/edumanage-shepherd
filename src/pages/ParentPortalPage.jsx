// src/pages/ParentPortalPage.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserCircle, LogOut, Upload, FileText, Smartphone } from 'lucide-react';
import { computeTermReport } from '../lib/gradeCalculations';
import { generateReportCard } from '../lib/reportCardGenerator';
import { generateKgReportCard } from '../lib/kgReportCardGenerator';

const ACADEMIC_YEAR = '2025/2026';

export default function ParentPortalPage() {
  // ── OTP ────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Session et données ───────────────────────────────────────────
  const [session, setSession] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [student, setStudent] = useState(null);
  const [parentName, setParentName] = useState('Parent');

  const [notifications, setNotifications] = useState([]);
  const [balance, setBalance] = useState({ expected: 0, paid: 0, remaining: 0 });
  const [termBalances, setTermBalances] = useState([]);
  const [attendance, setAttendance] = useState({ present: 0, absent: 0, late: 0 });
  const [terms, setTerms] = useState([]);
  const [justifications, setJustifications] = useState([]);
  const [showJustifyModal, setShowJustifyModal] = useState(false);
  const [justifyFile, setJustifyFile] = useState(null);
  const [justifyReason, setJustifyReason] = useState('');
  const [justifyMessage, setJustifyMessage] = useState('');
  const [schoolConfig, setSchoolConfig] = useState({ name: 'School Name', address: '', phone: '', email: '', logo: null });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleLoggedIn(session);
    });
    loadSchoolConfig();
  }, []);

  const loadSchoolConfig = async () => {
    const { data } = await supabase.from('app_settings').select('*');
    const cfg = {};
    (data || []).forEach(d => { cfg[d.key] = d.value; });
    setSchoolConfig({ name: cfg.school_name || 'School Name', address: cfg.address || '', phone: cfg.phone || '', email: cfg.email || '', logo: cfg.logo || null });
  };

  // ── Envoi OTP (vérification locale avant) ────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleaned = phone.replace(/[^0-9]/g, '');

    // 1. Vérifier que le numéro existe dans la base
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('parent_phone', cleaned)
      .maybeSingle();

    if (studentError || !studentData) {
      setError('This phone number is not registered in our system.');
      setLoading(false);
      return;
    }

    // 2. Numéro trouvé → envoyer OTP
    const formattedPhone = '+233' + cleaned.slice(1);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: { shouldCreateUser: true, data: { phone: cleaned } },
    });

    if (otpError) {
      setError(otpError.message);
    } else {
      setOtpSent(true);
    }
    setLoading(false);
  };

  // ── Vérification OTP ──────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleaned = phone.replace(/[^0-9]/g, '');
    const formattedPhone = '+233' + cleaned.slice(1);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: otp,
      type: 'sms',
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      handleLoggedIn(data.session);
    }
    setLoading(false);
  };

  // ── Chargement des enfants ────────────────────────────────────────
  const handleLoggedIn = async (currentSession) => {
    setSession(currentSession);
    const userPhone = currentSession.user.phone;
    if (!userPhone) return;

    const { data: studentsData } = await supabase
      .from('students')
      .select('id, first_name, last_name, class_id, parent_name, classes(name)')
      .eq('parent_phone', userPhone)
      .eq('active', true)
      .order('last_name');

    if (!studentsData || studentsData.length === 0) return;

    setAllStudents(studentsData);
    const firstStudent = studentsData[0];
    setSelectedStudentId(firstStudent.id);
    setStudent(firstStudent);
    setParentName(firstStudent.parent_name || 'Parent');

    loadStudentData(firstStudent.id);
    loadSharedData(firstStudent.id);
  };

  const handleSelectStudent = async (studentId) => {
    setSelectedStudentId(studentId);
    const selected = allStudents.find(s => s.id === studentId);
    if (!selected) return;
    setStudent(selected);
    setParentName(selected.parent_name || 'Parent');
    loadStudentData(studentId);
    loadSharedData(studentId);
  };

  const loadStudentData = async (studentId) => {
    fetchBalance(studentId);
    fetchTermBalances(studentId);
    fetchAttendance(studentId);
  };

  const loadSharedData = async (studentId) => {
    const { data: notifs } = await supabase.from('attendance_notifications').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(5);
    setNotifications(notifs || []);

    const { data: justifs } = await supabase.from('absence_justifications').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
    setJustifications(justifs || []);

    fetchTerms();
  };

  // ── Fonctions de données (inchangées) ────────────────────────────
  const fetchBalance = async (studentId) => {
    const { data: studentData } = await supabase.from('students').select('class_id').eq('id', studentId).single();
    if (!studentData?.class_id) return;
    const { data: classData } = await supabase.from('classes').select('level_id').eq('id', studentData.class_id).single();
    if (!classData?.level_id) return;
    const levelId = classData.level_id;
    const { data: fees } = await supabase.from('fee_structure').select('amount').eq('level_id', levelId).eq('academic_year', ACADEMIC_YEAR).eq('is_active', true);
    const totalExpected = (fees || []).reduce((sum, f) => sum + parseFloat(f.amount), 0);
    const { data: payments } = await supabase.from('fee_payments').select('amount').eq('student_id', studentId).eq('academic_year', ACADEMIC_YEAR).in('status', ['paid', 'partial']);
    const totalPaid = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const remaining = Math.max(0, totalExpected - totalPaid);
    setBalance({ expected: totalExpected, paid: totalPaid, remaining });
  };

  const fetchTermBalances = async (studentId) => {
    const terms = ['Term 1', 'Term 2', 'Term 3'];
    const results = [];
    for (const term of terms) {
      let expected = 0;
      const { data: studentData } = await supabase.from('students').select('class_id').eq('id', studentId).single();
      if (studentData?.class_id) {
        const { data: classData } = await supabase.from('classes').select('level_id').eq('id', studentData.class_id).single();
        if (classData?.level_id) {
          const { data: fees } = await supabase.from('fee_structure').select('amount').eq('level_id', classData.level_id).eq('academic_year', ACADEMIC_YEAR).eq('term', term).eq('is_active', true);
          expected = (fees || []).reduce((sum, f) => sum + parseFloat(f.amount), 0);
        }
      }
      const { data: payments } = await supabase.from('fee_payments').select('amount').eq('student_id', studentId).eq('academic_year', ACADEMIC_YEAR).eq('term', term).in('status', ['paid', 'partial']);
      const paid = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const remaining = Math.max(0, expected - paid);
      results.push({ term, expected, paid, remaining });
    }
    setTermBalances(results);
  };

  const fetchAttendance = async (studentId) => {
    const { data } = await supabase.from('attendance').select('status').eq('student_id', studentId);
    const counts = { present: 0, absent: 0, late: 0 };
    (data || []).forEach(record => { if (record.status === 'P') counts.present++; else if (record.status === 'A') counts.absent++; else if (record.status === 'L') counts.late++; });
    setAttendance(counts);
  };

  const fetchTerms = async () => {
    const { data } = await supabase.from('academic_terms').select('id, name, academic_year').eq('academic_year', ACADEMIC_YEAR).order('term_number');
    setTerms(data || []);
  };

  const handleGenerateReport = async (termId) => {
    if (!student || !student.id) return;
    const term = terms.find(t => t.id === termId);
    if (!term) return;
    const isKg = student.classes?.level === 'KG';
    if (isKg) {
      await generateKgReportCard({ studentId: student.id, termId: term.id, className: student.classes?.name || '', school: schoolConfig });
    } else {
      const report = await computeTermReport(student.id, term.id);
      generateReportCard({ student: { first_name: student.first_name || '', last_name: student.last_name || '', class: student.classes?.name || '', date_of_birth: '' }, report, term, school: schoolConfig });
    }
  };

  const handleUploadJustification = async () => {
    if (!justifyFile) return;
    setJustifyMessage('Uploading...');
    const fileName = `${student.id}/${Date.now()}_${justifyFile.name}`;
    const { error: uploadError } = await supabase.storage.from('justificatifs').upload(fileName, justifyFile);
    if (uploadError) { setJustifyMessage('Upload failed: ' + uploadError.message); return; }
    const { data: publicUrlData } = supabase.storage.from('justificatifs').getPublicUrl(fileName);
    const { data: parentAccount } = await supabase.from('parent_portal_accounts').select('id').eq('student_id', student.id).maybeSingle();
    if (!parentAccount) { setJustifyMessage('Could not verify parent account.'); return; }
    const { error: insertError } = await supabase.from('absence_justifications').insert({ student_id: student.id, parent_id: parentAccount.id, document_url: publicUrlData.publicUrl, reason: justifyReason });
    if (insertError) setJustifyMessage('Insert failed: ' + insertError.message);
    else {
      setJustifyMessage('Justification submitted!');
      setShowJustifyModal(false);
      setJustifyFile(null);
      setJustifyReason('');
      const { data: justifs } = await supabase.from('absence_justifications').select('*').eq('student_id', student.id).order('created_at', { ascending: false });
      setJustifications(justifs || []);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setStudent(null);
    setAllStudents([]);
    setSelectedStudentId(null);
    setParentName('Parent');
    setNotifications([]);
    setJustifications([]);
    setBalance({ expected: 0, paid: 0, remaining: 0 });
    setAttendance({ present: 0, absent: 0, late: 0 });
    setTerms([]);
  };

  // ── Vue connectée ──────────────────────────────────────────────────
  if (session && student) {
    const formatGHS = (n) => `GHS ${parseFloat(n || 0).toFixed(2)}`;
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome, {parentName}!</h1>
              {allStudents.length > 1 && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-sm text-gray-500">Your child:</label>
                  <select value={selectedStudentId} onChange={e => handleSelectStudent(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {allStudents.map(s => (<option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.classes?.name || 'No class'})</option>))}
                  </select>
                </div>
              )}
              {allStudents.length === 1 && (
                <p className="text-sm text-gray-500 mt-1">Your child: <strong className="text-blue-700">{student.first_name} {student.last_name}</strong> — {student.classes?.name}</p>
              )}
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 text-red-600 hover:text-red-800"><LogOut size={18} /> Sign out</button>
          </div>
          {/* ... contenu identique aux versions précédentes ... */}
        </div>
      </div>
    );
  }

  // ── Vue non connectée ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <UserCircle size={48} className="mx-auto text-blue-600 mb-2" />
          <h1 className="text-xl font-bold text-gray-900">Parent Portal</h1>
          <p className="text-sm text-gray-500">Sign in with your phone number</p>
        </div>
        {!otpSent && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0538777840" className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              <Smartphone size={16} /> {loading ? 'Sending code...' : 'Send OTP by SMS'}
            </button>
          </form>
        )}
        {otpSent && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">A code has been sent to <strong>{phone}</strong></p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" className="w-full border rounded-lg px-3 py-2 text-sm text-center text-lg tracking-widest" required maxLength={6} />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-2 rounded-lg font-medium disabled:opacity-50">
              {loading ? 'Verifying...' : 'Verify Code & Sign In'}
            </button>
            <button type="button" onClick={() => { setOtpSent(false); setOtp(''); setError(''); }} className="w-full text-sm text-blue-600 hover:underline">Change phone number</button>
          </form>
        )}
      </div>
    </div>
  );
}