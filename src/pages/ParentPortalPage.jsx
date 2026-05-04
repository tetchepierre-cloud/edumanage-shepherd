// src/pages/ParentPortalPage.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserCircle, LogOut, GraduationCap, Upload } from 'lucide-react';

export default function ParentPortalPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [student, setStudent] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showJustifyModal, setShowJustifyModal] = useState(false);
  const [justifyFile, setJustifyFile] = useState(null);
  const [justifyReason, setJustifyReason] = useState('');
  const [justifyMessage, setJustifyMessage] = useState('');
  const [justifications, setJustifications] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleLoggedIn(session);
    });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      setError(loginError.message);
      setLoading(false);
    } else {
      handleLoggedIn(data.session);
    }
  };

  const handleLoggedIn = async (currentSession) => {
    setSession(currentSession);
    const studentId = currentSession.user.user_metadata?.student_id;
    if (!studentId) return;

    const { data: studentData } = await supabase
      .from('students')
      .select('id, first_name, last_name, class_id, classes(name)')
      .eq('id', studentId)
      .single();
    setStudent(studentData);

    const { data: notifs } = await supabase
      .from('attendance_notifications')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5);
    setNotifications(notifs || []);

    const { data: justifs } = await supabase
      .from('absence_justifications')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    setJustifications(justifs || []);
  };

  const handleUploadJustification = async () => {
    if (!justifyFile) return;
    setJustifyMessage('Uploading...');
    const fileName = `${student.id}/${Date.now()}_${justifyFile.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('justificatifs')
      .upload(fileName, justifyFile);

    if (uploadError) {
      setJustifyMessage('Upload failed: ' + uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('justificatifs')
      .getPublicUrl(fileName);

    // Récupération de l'ID du compte parent
    const { data: parentAccount, error: accountError } = await supabase
      .from('parent_portal_accounts')
      .select('id')
      .eq('student_id', student.id)
      .single();

    if (accountError || !parentAccount) {
      setJustifyMessage('Could not verify parent account.');
      return;
    }

    const { error: insertError } = await supabase.from('absence_justifications').insert({
      student_id: student.id,
      parent_id: parentAccount.id,
      document_url: publicUrlData.publicUrl,
      reason: justifyReason,
    });

    if (insertError) {
      setJustifyMessage('Insert failed: ' + insertError.message);
    } else {
      setJustifyMessage('Justification submitted! It will be reviewed by the teacher.');
      setShowJustifyModal(false);
      setJustifyFile(null);
      setJustifyReason('');
      const { data: justifs } = await supabase
        .from('absence_justifications')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false });
      setJustifications(justifs || []);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setStudent(null);
    setNotifications([]);
    setJustifications([]);
  };

  if (session && student) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome, {student.first_name}!</h1>
              <p className="text-gray-500">Class: {student.classes?.name}</p>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 text-red-600 hover:text-red-800">
              <LogOut size={18} /> Sign out
            </button>
          </div>

          <div className="bg-white rounded-xl shadow p-6 text-center mb-6">
            <GraduationCap size={64} className="mx-auto text-blue-400 mb-4" />
            <h2 className="text-lg font-semibold text-gray-700">Student Progress Dashboard</h2>
            <p className="text-gray-500 mt-2">
              Attendance, grades and financial statements will appear here once the school publishes them.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Recent Notifications</h2>
            {notifications.length === 0 ? (
              <p className="text-gray-400">No recent notifications.</p>
            ) : (
              <ul className="divide-y">
                {notifications.map(n => (
                  <li key={n.id} className="py-2 flex justify-between">
                    <span className="text-sm">{n.message}</span>
                    <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleDateString('en-GB')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Absence Justifications</h2>
              <button
                onClick={() => setShowJustifyModal(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
              >
                <Upload size={16} /> Submit Justification
              </button>
            </div>
            {justifications.length === 0 ? (
              <p className="text-gray-400">No justifications submitted yet.</p>
            ) : (
              <ul className="divide-y">
                {justifications.map(j => (
                  <li key={j.id} className="py-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{j.reason || 'No reason provided'}</p>
                      <p className="text-xs text-gray-400">{new Date(j.created_at).toLocaleDateString('en-GB')}</p>
                      {j.validated_at ? (
                        <span className="text-xs text-green-600 font-medium">Validated</span>
                      ) : (
                        <span className="text-xs text-yellow-600 font-medium">Pending review</span>
                      )}
                    </div>
                    {j.document_url && (
                      <a href={j.document_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs underline">
                        View document
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showJustifyModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
                <h3 className="font-semibold text-lg mb-4">Submit Absence Justification</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
                    <textarea
                      value={justifyReason}
                      onChange={e => setJustifyReason(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      rows={3}
                      placeholder="e.g. Medical certificate, family event..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Attachment (optional)</label>
                    <input
                      type="file"
                      onChange={e => setJustifyFile(e.target.files[0])}
                      className="w-full text-sm"
                    />
                  </div>
                  {justifyMessage && <p className="text-sm text-blue-600">{justifyMessage}</p>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleUploadJustification} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Submit</button>
                    <button onClick={() => { setShowJustifyModal(false); setJustifyMessage(''); }} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <UserCircle size={48} className="mx-auto text-blue-600 mb-2" />
          <h1 className="text-xl font-bold text-gray-900">Parent Portal</h1>
          <p className="text-sm text-gray-500">Sign in with your email</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full border rounded-lg px-3 py-2 text-sm" required />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}