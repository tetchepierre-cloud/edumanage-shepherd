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

  // ── Envoi OTP ─────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleaned = phone.replace(/[^0-9]/g, '');
    const formattedPhone = '+233' + cleaned.slice(1);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: { shouldCreateUser: true, data: { phone: cleaned } },
    });

    if (otpError) setError(otpError.message);
    else setOtpSent(true);
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

  // ── Chargement après connexion (utilise student_id du hook) ──────
  const handleLoggedIn = async (currentSession) => {
    setSession(currentSession);
    const studentId = currentSession.user.user_metadata?.student_id;
    if (!studentId) return;

    const { data: studentData } = await supabase
      .from('students')
      .select('first_name, last_name, class_id, parent_name, classes(name)')
      .eq('id', studentId)
      .maybeSingle();

    if (!studentData) return;

    setStudent(studentData);
    setParentName(studentData.parent_name || 'Parent');
    setAllStudents([studentData]);
    setSelectedStudentId(studentData.id);

    loadStudentData(studentData.id);
    loadSharedData(studentData.id);
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

  // ── Fonctions de données ──────────────────────────────────────────
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

          {/* Solde annuel */}
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">📚 Your Child's School Fees ({ACADEMIC_YEAR})</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-sm text-gray-500">Total fees for the year</p><p className="text-xl font-bold text-blue-600">{formatGHS(balance.expected)}</p></div>
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-sm text-gray-500">Already paid</p><p className="text-xl font-bold text-green-600">{formatGHS(balance.paid)}</p></div>
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-sm text-gray-500">Left to pay</p><p className={`text-xl font-bold ${balance.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatGHS(balance.remaining)}</p></div>
            </div>
          </div>

          {/* Résumé par terme */}
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">📅 Payment Summary by Term</h2>
            {termBalances.length === 0 ? <p className="text-gray-400 text-sm">Loading term details...</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-2 font-semibold text-gray-600">Term</th><th className="text-right px-4 py-2 font-semibold text-gray-600">Expected</th><th className="text-right px-4 py-2 font-semibold text-gray-600">Paid</th><th className="text-right px-4 py-2 font-semibold text-gray-600">Balance</th></tr></thead><tbody className="divide-y divide-gray-100">{termBalances.map((tb) => (<tr key={tb.term} className="hover:bg-gray-50"><td className="px-4 py-2 font-medium">{tb.term}</td><td className="px-4 py-2 text-right">{formatGHS(tb.expected)}</td><td className="px-4 py-2 text-right text-green-600">{formatGHS(tb.paid)}</td><td className={`px-4 py-2 text-right font-semibold ${tb.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatGHS(tb.remaining)}</td></tr>))}</tbody></table></div>
            )}
          </div>

          {/* Présence */}
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">📅 Attendance Summary</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 rounded-lg p-3"><p className="text-sm text-gray-500">Days Present</p><p className="text-2xl font-bold text-green-700">{attendance.present}</p></div>
              <div className="bg-red-50 rounded-lg p-3"><p className="text-sm text-gray-500">Days Absent</p><p className="text-2xl font-bold text-red-700">{attendance.absent}</p></div>
              <div className="bg-yellow-50 rounded-lg p-3"><p className="text-sm text-gray-500">Days Late</p><p className="text-2xl font-bold text-yellow-700">{attendance.late}</p></div>
            </div>
          </div>

          {/* Bulletins */}
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">📚 Terminal Reports</h2>
            {terms.length === 0 ? <p className="text-gray-400 text-sm">No terms available yet.</p> : (
              <ul className="space-y-2">{terms.map(term => (<li key={term.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"><span className="font-medium">{term.name} ({term.academic_year})</span><button onClick={() => handleGenerateReport(term.id)} className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"><FileText size={16} /> View Report</button></li>))}</ul>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Recent Notifications</h2>
            {notifications.length === 0 ? <p className="text-gray-400">No recent notifications.</p> : (
              <ul className="divide-y">{notifications.map(n => (<li key={n.id} className="py-2 flex justify-between"><span className="text-sm">{n.message}</span><span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleDateString('en-GB')}</span></li>))}</ul>
            )}
          </div>

          {/* Justificatifs */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Absence Justifications</h2>
              <button onClick={() => setShowJustifyModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Upload size={16} /> Submit Justification</button>
            </div>
            {justifications.length === 0 ? <p className="text-gray-400">No justifications submitted yet.</p> : (
              <ul className="divide-y">{justifications.map(j => (<li key={j.id} className="py-3 flex justify-between items-center"><div><p className="text-sm font-medium">{j.reason || 'No reason provided'}</p><p className="text-xs text-gray-400">{new Date(j.created_at).toLocaleDateString('en-GB')}</p>{j.validated_at ? <span className="text-xs text-green-600 font-medium">Validated</span> : <span className="text-xs text-yellow-600 font-medium">Pending review</span>}</div>{j.document_url && <a href={j.document_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs underline">View document</a>}</li>))}</ul>
            )}
          </div>

          {showJustifyModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md"><h3 className="font-semibold text-lg mb-4">Submit Absence Justification</h3><div className="space-y-3"><div><label className="block text-xs font-medium text-gray-500 mb-1">Reason</label><textarea value={justifyReason} onChange={e => setJustifyReason(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="e.g. Medical certificate, family event..." /></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Attachment (optional)</label><input type="file" onChange={e => setJustifyFile(e.target.files[0])} className="w-full text-sm" /></div>{justifyMessage && <p className="text-sm text-blue-600">{justifyMessage}</p>}<div className="flex gap-2 pt-2"><button onClick={handleUploadJustification} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Submit</button><button onClick={() => { setShowJustifyModal(false); setJustifyMessage(''); }} className="border px-4 py-2 rounded-lg text-sm">Cancel</button></div></div></div></div>
          )}
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
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0538777840" className="w-full border rounded-lg px-3 py-2 text-sm" required /></div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"><Smartphone size={16} /> {loading ? 'Sending code...' : 'Send OTP by SMS'}</button>
          </form>
        )}
        {otpSent && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">A code has been sent to <strong>{phone}</strong></p>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label><input type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" className="w-full border rounded-lg px-3 py-2 text-sm text-center text-lg tracking-widest" required maxLength={6} /></div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-2 rounded-lg font-medium disabled:opacity-50">{loading ? 'Verifying...' : 'Verify Code & Sign In'}</button>
            <button type="button" onClick={() => { setOtpSent(false); setOtp(''); setError(''); }} className="w-full text-sm text-blue-600 hover:underline">Change phone number</button>
          </form>
        )}
      </div>
    </div>
  );
}