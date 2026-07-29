// src/pages/SMSPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { CanAct } from '../components/PermissionGate';
import { Send, History, Users, FileText } from 'lucide-react';

const ACADEMIC_YEARS = ['2024/2025', '2025/2026', '2026/2027'];
const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export default function SMSPage() {
  const { profile } = useAuthStore();

  // États pour le formulaire
  const [category, setCategory] = useState('academic');
  const [subCategory, setSubCategory] = useState('all_parents');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [term, setTerm] = useState('Term 1');
  const [customRecipients, setCustomRecipients] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('');

  // États pour l'historique
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // États pour les listes déroulantes (classes, staff positions)
  const [classes, setClasses] = useState([]);
  const [staffPositions, setStaffPositions] = useState([]);

  // Modèles de messages
  const templates = [
    { name: 'Report Card Ceremony', text: 'Dear Parent, we invite you to the report card ceremony on [date] at [time]. Please confirm your attendance.' },
    { name: 'Fee Payment Reminder', text: 'Dear Parent, this is a reminder that school fees for [month] are due. Please settle your balance as soon as possible.' },
    { name: 'Report Card Available', text: 'Dear Parent, your child\'s report card is now available on the parent portal. Kindly log in to view it.' },
  ];

  useEffect(() => {
    fetchLogs();
    fetchClasses();
    fetchStaffPositions();
    loadDefaultAcademicYear();
  }, []);

  const loadDefaultAcademicYear = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'academic_year')
      .maybeSingle();
    if (data?.value) setAcademicYear(data.value);
  };

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, levels(name)')
      .order('name');
    setClasses(data || []);
  };

  const fetchStaffPositions = async () => {
    const { data } = await supabase
      .from('staff')
      .select('position')
      .eq('active', true)
      .not('position', 'is', null);
    const unique = [...new Set(data?.map(s => s.position) || [])].sort();
    setStaffPositions(unique);
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from('sms_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(50);
    if (!error) setLogs(data || []);
    setLoadingLogs(false);
  };

  // ── Récupération des destinataires ──
  const getRecipients = async () => {
    let numbers = [];

    if (category === 'custom') {
      const raw = customRecipients.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      numbers = raw.map(n => ({ number: n, name: 'Custom' }));
      return numbers;
    }

    // ── ACADEMIC ──
    if (category === 'academic') {
      // Récupérer tous les étudiants actifs avec classe et niveau
      const { data: students, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, parent_phone, class_id, classes(id, name, levels(name))')
        .eq('active', true)
        .not('parent_phone', 'is', null);

      if (error) {
        console.error('Academic query error:', error);
        return [];
      }

      let filtered = students || [];

      // Filtrer en mémoire selon le sous-groupe
      if (subCategory === 'kg') {
        filtered = filtered.filter(s => 
          s.classes?.levels?.name && s.classes.levels.name.toLowerCase().includes('kg')
        );
      } else if (subCategory === 'lower_primary') {
        filtered = filtered.filter(s => 
          s.classes?.levels?.name && s.classes.levels.name.toLowerCase().includes('primary') &&
          ['P1', 'P2', 'P3'].includes(s.classes?.name)
        );
      } else if (subCategory === 'upper_primary') {
        filtered = filtered.filter(s => 
          s.classes?.levels?.name && s.classes.levels.name.toLowerCase().includes('primary') &&
          ['P4', 'P5', 'P6'].includes(s.classes?.name)
        );
      } else if (subCategory === 'jhs') {
        filtered = filtered.filter(s => 
          s.classes?.levels?.name && s.classes.levels.name.toLowerCase().includes('jhs')
        );
      } else if (subCategory.startsWith('class_')) {
        const classId = subCategory.replace('class_', '');
        filtered = filtered.filter(s => s.class_id === classId);
      }
      // 'all_parents' => pas de filtre

      numbers = filtered.map(s => ({
        number: s.parent_phone.trim(),
        name: `Parent of ${s.first_name} ${s.last_name}`,
      }));
    }

    // ── FINANCIAL ──
    if (category === 'financial') {
      // Récupérer tous les étudiants actifs avec leur classe
      const { data: students, error: studentsErr } = await supabase
        .from('students')
        .select('id, first_name, last_name, parent_phone, class_id, classes(levels(name))')
        .eq('active', true)
        .not('parent_phone', 'is', null);
      if (studentsErr) return [];

      // Pour chaque étudiant, calculer le solde restant
      const studentBalances = await Promise.all(
        students.map(async (student) => {
          const balance = await getStudentBalance(student.id, academicYear, term);
          return { ...student, balance };
        })
      );

      let filtered = studentBalances;
      if (subCategory === 'defaulters') {
        filtered = filtered.filter(s => s.balance > 0);
      } else if (subCategory === 'one_month_due') {
        // Pour l'instant, même logique que defaulters (à affiner si nécessaire)
        filtered = filtered.filter(s => s.balance > 0);
      } else if (subCategory === 'two_months_due') {
        filtered = filtered.filter(s => s.balance > 0);
      } else if (subCategory === 'fully_paid') {
        filtered = filtered.filter(s => s.balance <= 0);
      } else if (subCategory === 'scholarship') {
        // Si vous avez un champ scholarship, filtrez ici, sinon on renvoie vide
        filtered = [];
      }

      numbers = filtered.map(s => ({
        number: s.parent_phone.trim(),
        name: `Parent of ${s.first_name} ${s.last_name}`,
      }));
    }

    // ── STAFF ──
    if (category === 'staff') {
      let query = supabase
        .from('staff')
        .select('first_name, last_name, phone')
        .eq('active', true)
        .not('phone', 'is', null);

      if (subCategory === 'teaching') {
        query = query.in('position', ['Teacher', 'Headmaster', 'Assistant Teacher']);
      } else if (subCategory === 'non_teaching') {
        query = query.in('position', ['Accountant', 'Secretary', 'Admin', 'Manager']);
      } else if (subCategory === 'support') {
        query = query.in('position', ['Security', 'Janitor', 'Cook', 'Driver', 'Groundsman']);
      } else if (subCategory.startsWith('position_')) {
        const pos = subCategory.replace('position_', '');
        query = query.eq('position', pos);
      }
      // 'all_staff' => pas de filtre

      const { data, error } = await query;
      if (error) return [];
      numbers = (data || []).map(s => ({
        number: s.phone.trim(),
        name: `${s.first_name} ${s.last_name}`,
      }));
    }

    // Nettoyer les numéros (au moins 10 chiffres)
    const validNumbers = numbers.filter(({ number }) => {
      const cleaned = number.replace(/\s/g, '');
      return /^\d{10,}$/.test(cleaned);
    });

    return validNumbers;
  };

  // Fonction utilitaire : calcul du solde d'un étudiant pour une année/terme donnés
  const getStudentBalance = async (studentId, year, term) => {
    // 1) Récupérer le niveau de l'étudiant
    const { data: student } = await supabase
      .from('students')
      .select('class_id, classes(levels(id))')
      .eq('id', studentId)
      .single();
    if (!student?.classes?.levels?.id) return 0;
    const levelId = student.classes.levels.id;

    // 2) Récupérer les frais attendus pour ce niveau, année et terme
    const { data: feeStructures } = await supabase
      .from('fee_structure')
      .select('id, amount, fee_name')
      .eq('level_id', levelId)
      .eq('academic_year', year)
      .eq('term', term)
      .eq('is_active', true);

    if (!feeStructures || feeStructures.length === 0) return 0;

    // 3) Récupérer les tranches (fee_schedules)
    const feeIds = feeStructures.map(f => f.id);
    const { data: schedules } = await supabase
      .from('fee_schedules')
      .select('fee_structure_id, amount')
      .in('fee_structure_id', feeIds);

    const totalExpected = feeStructures.reduce((sum, fee) => {
      const feeSchedules = (schedules || []).filter(s => s.fee_structure_id === fee.id);
      const totalSched = feeSchedules.reduce((s, sc) => s + parseFloat(sc.amount || 0), 0);
      return sum + totalSched;
    }, 0);

    // 4) Récupérer les paiements effectués
    const { data: payments } = await supabase
      .from('fee_payments')
      .select('amount')
      .eq('student_id', studentId)
      .eq('academic_year', year)
      .eq('term', term)
      .in('status', ['paid', 'partial']);

    const totalPaid = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    return Math.max(0, totalExpected - totalPaid);
  };

  // ── Envoyer les SMS ──
  const handleSend = async () => {
    if (!message.trim()) {
      setStatusMessage('Please enter a message.');
      setStatusType('error');
      return;
    }

    const recipients = await getRecipients();
    if (recipients.length === 0) {
      setStatusMessage('No valid recipients found. Please check your selection or phone numbers.');
      setStatusType('error');
      return;
    }

    const confirmMsg = `You are about to send this message to ${recipients.length} recipient(s). Confirm?`;
    if (!window.confirm(confirmMsg)) return;

    setSending(true);
    setStatusMessage('');

    let successCount = 0;
    let failCount = 0;

    for (const rec of recipients) {
      try {
        const cleanedNumber = rec.number.replace(/\s/g, '');
        const response = await supabase.functions.invoke('send-sms', {
          body: {
            phone: cleanedNumber,
            message: message.trim(),
          },
        });

        if (response.error) {
          console.error(`Failed for ${cleanedNumber}:`, response.error);
          failCount++;
          await supabase.from('sms_logs').insert({
            recipient_number: cleanedNumber,
            message: message.trim(),
            status: 'failed',
            sent_by: profile?.id,
            recipient_type: category === 'staff' ? 'staff' : 'parent',
            recipient_name: rec.name || '—',
            group_name: subCategory || category,
            error_message: response.error.message || 'Unknown error',
          });
        } else {
          successCount++;
          await supabase.from('sms_logs').insert({
            recipient_number: cleanedNumber,
            message: message.trim(),
            status: 'sent',
            sent_by: profile?.id,
            recipient_type: category === 'staff' ? 'staff' : 'parent',
            recipient_name: rec.name || '—',
            group_name: subCategory || category,
          });
        }
      } catch (err) {
        console.error('Network error:', err);
        failCount++;
        await supabase.from('sms_logs').insert({
          recipient_number: rec.number,
          message: message.trim(),
          status: 'failed',
          sent_by: profile?.id,
          recipient_type: category === 'staff' ? 'staff' : 'parent',
          recipient_name: rec.name || '—',
          group_name: subCategory || category,
          error_message: err.message || 'Network error',
        });
      }
    }

    await fetchLogs();

    setStatusMessage(`${successCount} SMS sent, ${failCount} failed.`);
    setStatusType(successCount > 0 ? 'success' : 'error');
    setSending(false);

    if (successCount > 0) {
      setMessage('');
      setCustomRecipients('');
    }
  };

  const applyTemplate = (text) => setMessage(text);

  // ── Options dynamiques pour les sous-groupes ──
  const getSubOptions = () => {
    if (category === 'academic') {
      const classOptions = classes.map(c => ({
        value: `class_${c.id}`,
        label: `${c.name} (${c.levels?.name || 'No level'})`,
      }));
      return [
        { value: 'all_parents', label: 'All Parents' },
        { value: 'kg', label: 'KG (Nursery & KG)' },
        { value: 'lower_primary', label: 'Lower Primary (P1–P3)' },
        { value: 'upper_primary', label: 'Upper Primary (P4–P6)' },
        { value: 'jhs', label: 'JHS (JHS1–JHS3)' },
        ...classOptions,
      ];
    }
    if (category === 'financial') {
      return [
        { value: 'defaulters', label: 'All Defaulters (balance > 0)' },
        { value: 'one_month_due', label: '1 Month Due (approx.)' },
        { value: 'two_months_due', label: '2+ Months Due' },
        { value: 'fully_paid', label: 'Fully Paid' },
        { value: 'scholarship', label: 'Scholarship Holders' },
      ];
    }
    if (category === 'staff') {
      const positionOptions = staffPositions.map(pos => ({
        value: `position_${pos}`,
        label: pos,
      }));
      return [
        { value: 'all_staff', label: 'All Staff' },
        { value: 'teaching', label: 'Teaching Staff' },
        { value: 'non_teaching', label: 'Non‑Teaching Staff' },
        { value: 'support', label: 'Support Staff' },
        ...positionOptions,
      ];
    }
    return [];
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMS Management</h1>
          <p className="text-gray-500 text-sm mt-1">Send bulk SMS to parents and staff</p>
        </div>
      </div>

      {statusMessage && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          statusType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          statusType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Formulaire ── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Compose Message</h2>

            {/* Catégorie et sous-catégorie */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSubCategory(e.target.value === 'academic' ? 'all_parents' : 'all_staff');
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="academic">Academic</option>
                  <option value="financial">Financial</option>
                  <option value="staff">Staff</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                {category === 'custom' ? (
                  <input type="text" disabled className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-500" value="Manual entry" />
                ) : (
                  <select
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    {getSubOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Champs pour Academic / Financial */}
            {(category === 'academic' || category === 'financial') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                  <select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Custom numbers */}
            {category === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone numbers (one per line, separated by comma or semicolon)
                </label>
                <textarea
                  rows={3}
                  value={customRecipients}
                  onChange={(e) => setCustomRecipients(e.target.value)}
                  placeholder="e.g. 233XXXXXXXXX, 233YYYYYYYYY"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                maxLength={1600}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{message.length} characters</span>
                <span>{Math.ceil(message.length / 160)} SMS</span>
              </div>
            </div>

            {/* Templates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Templates</label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t, idx) => (
                  <button
                    key={idx}
                    onClick={() => applyTemplate(t.text)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1 rounded-full"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <CanAct module="sms" section="actions" element="Send SMS">
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={16} />
                {sending ? 'Sending...' : 'Send SMS'}
              </button>
            </CanAct>
          </div>
        </div>

        {/* ── Info ── */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users size={18} /> About SMS
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>Each SMS can contain up to <strong>160 characters</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>Long messages are concatenated (up to 1600 characters).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>Phone numbers must have at least <strong>10 digits</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>Only <strong>director</strong> and <strong>admin</strong> can send SMS.</span>
              </li>
            </ul>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FileText size={18} /> Quick Tips
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>• Personalize messages with student names if needed.</li>
              <li>• Avoid using special characters that may affect delivery.</li>
              <li>• Check the history to confirm delivery status.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Historique ── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <History size={18} /> Sent SMS History
          </h2>
          <span className="text-xs text-gray-400">Last 50 messages</span>
        </div>
        {loadingLogs ? (
          <div className="p-6 text-center text-gray-400">Loading history...</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No SMS sent yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">Recipient</th>
                  <th className="text-left px-4 py-3">Number</th>
                  <th className="text-left px-4 py-3">Message</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{log.recipient_name || '—'}</td>
                    <td className="px-4 py-2 text-gray-700">{log.recipient_number}</td>
                    <td className="px-4 py-2 text-gray-700 truncate max-w-xs">{log.message}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.status === 'sent' ? 'bg-green-100 text-green-700' :
                        log.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'sent' && '✓ Sent'}
                        {log.status === 'failed' && '✗ Failed'}
                        {log.status === 'queued' && '⏳ Queued'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-500">
                      {new Date(log.sent_at).toLocaleString('en-GH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-3 border-t bg-gray-50 text-right">
          <button onClick={fetchLogs} className="text-sm text-blue-600 hover:text-blue-800">
            Refresh history
          </button>
        </div>
      </div>
    </div>
  );
}