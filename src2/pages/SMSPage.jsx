// src/pages/SMSPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { CanAct } from '../components/PermissionGate';
import { Send, History, Users, FileText } from 'lucide-react';

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

function generateAcademicYears() {
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const years = [];
  for (let i = -2; i <= 1; i++) {
    const y = startYear + i;
    years.push(`${y}/${y + 1}`);
  }
  return years;
}

// ═══════════════════════════════════════════════════════
// TEMPLATES FINANCIERS AVEC VARIABLES DYNAMIQUES
// Variables : [StudentName], [Balance], [Term]
// ═══════════════════════════════════════════════════════
const FINANCIAL_TEMPLATES = {
  defaulters:     'Dear Parent of [StudentName], your outstanding balance for [Term] is [Balance]. Kindly settle promptly. Thank you.',
  zero_payers:    'Dear Parent of [StudentName], no payment has been received for [Term]. Please contact the accounts office. Thank you.',
  high_debtors:   'Dear Parent of [StudentName], over 50% of [Term] fees remain unpaid ([Balance]). Kindly settle urgently. Thank you.',
  due_this_month: 'Dear Parent of [StudentName], a fee instalment for [Term] is due this month. Kindly settle on time. Thank you.',
  fully_paid:     'Dear Parent of [StudentName], thank you for settling [Term] fees in full. We truly appreciate it.',
};

const ACADEMIC_TEMPLATES = [
  { name: 'Report Card Ceremony',   text: 'Dear Parent, we invite you to the report card ceremony on [date] at [time]. Please confirm your attendance.' },
  { name: 'Report Card Available',  text: 'Dear Parent, your child\'s report card is now available on the parent portal. Kindly log in to view it.' },
  { name: 'PTA Meeting',            text: 'Dear Parent, a PTA meeting is scheduled for [date] at [time]. Your presence is highly appreciated.' },
];

export default function SMSPage() {
  const { profile } = useAuthStore();
  const ACADEMIC_YEARS = generateAcademicYears();

  const [category, setCategory] = useState('academic');
  const [subCategory, setSubCategory] = useState('all_parents');
  const [academicYear, setAcademicYear] = useState(ACADEMIC_YEARS[2]);
  const [term, setTerm] = useState('Term 1');
  const [customRecipients, setCustomRecipients] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('');

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [classes, setClasses] = useState([]);
  const [staffPositions, setStaffPositions] = useState([]);

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
    const { data } = await supabase.from('classes').select('id, name, level_id').order('name');
    setClasses(data || []);
  };

  const fetchStaffPositions = async () => {
    const { data } = await supabase.from('staff').select('position').eq('active', true).not('position', 'is', null);
    const unique = [...new Set(data?.map(s => s.position) || [])].sort();
    setStaffPositions(unique);
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase.from('sms_logs').select('*').order('sent_at', { ascending: false }).limit(50);
    if (!error) setLogs(data || []);
    setLoadingLogs(false);
  };

  // ═══════════════════════════════════════════════════════
  // PERSONNALISATION DU MESSAGE PAR ÉLÈVE
  // ═══════════════════════════════════════════════════════
  const personalizeMessage = (template, recipient, termValue) => {
    if (!recipient?.studentName) return template;

    const balanceStr = recipient.balance !== undefined
      ? `GHS ${parseFloat(recipient.balance).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '';

    return template
      .replace(/\[StudentName\]/g, recipient.studentName || '')
      .replace(/\[Balance\]/g, balanceStr)
      .replace(/\[Term\]/g, termValue || '');
  };

  // ═══════════════════════════════════════════════════════
  // CALCUL DES SOLDES EN BATCH
  // ═══════════════════════════════════════════════════════
  async function calculateBalancesForStudents(students, academicYear, term) {
    if (!students.length) return {};

    const studentIds = students.map(s => s.id);
    const levelIds = [...new Set(students.map(s => s.level_id).filter(Boolean))];
    if (!levelIds.length) return {};

    let feeQuery = supabase
      .from('fee_structure')
      .select('id, amount, level_id')
      .in('level_id', levelIds)
      .eq('academic_year', academicYear)
      .eq('is_active', true);
    if (term) feeQuery = feeQuery.eq('term', term);
    const { data: fees } = await feeQuery;

    const feeIds = (fees || []).map(f => f.id);

    const [schedulesRes, discountsRes, overridesRes, optionalsRes, paymentsRes] = await Promise.all([
      supabase.from('fee_schedules').select('amount, fee_structure_id, due_date').in('fee_structure_id', feeIds),
      supabase.from('student_fee_discounts').select('student_id, fee_structure_id, discount_type, discount_value').in('student_id', studentIds),
      supabase.from('student_fee_overrides').select('student_id, fee_structure_id, override_amount').in('student_id', studentIds),
      supabase.from('student_optional_fees').select('student_id, amount').in('student_id', studentIds).eq('academic_year', academicYear).eq('is_active', true),
      supabase.from('fee_payments').select('student_id, amount').in('student_id', studentIds).eq('academic_year', academicYear).in('status', ['paid', 'partial']),
    ]);

    const feesByLevel = {};
    (fees || []).forEach(f => {
      if (!feesByLevel[f.level_id]) feesByLevel[f.level_id] = [];
      feesByLevel[f.level_id].push(f);
    });

    const schedSumByFee = {};
    const schedDatesByFee = {};
    (schedulesRes.data || []).forEach(s => {
      schedSumByFee[s.fee_structure_id] = (schedSumByFee[s.fee_structure_id] || 0) + parseFloat(s.amount || 0);
      if (!schedDatesByFee[s.fee_structure_id]) schedDatesByFee[s.fee_structure_id] = [];
      if (s.due_date) schedDatesByFee[s.fee_structure_id].push(s.due_date);
    });

    const discBySF = {};
    (discountsRes.data || []).forEach(d => { discBySF[`${d.student_id}|${d.fee_structure_id}`] = d; });

    const ovBySF = {};
    (overridesRes.data || []).forEach(o => { ovBySF[`${o.student_id}|${o.fee_structure_id}`] = o.override_amount; });

    const optByStudent = {};
    (optionalsRes.data || []).forEach(o => {
      optByStudent[o.student_id] = (optByStudent[o.student_id] || 0) + parseFloat(o.amount || 0);
    });

    const paidByStudent = {};
    (paymentsRes.data || []).forEach(p => {
      paidByStudent[p.student_id] = (paidByStudent[p.student_id] || 0) + parseFloat(p.amount || 0);
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const results = {};
    students.forEach(stu => {
      const levelId = stu.level_id;
      if (!levelId) {
        results[stu.id] = { expected: 0, paid: 0, balance: 0, hasDueThisMonth: false };
        return;
      }

      const levelFees = feesByLevel[levelId] || [];
      let expected = 0;
      let hasDueThisMonth = false;

      levelFees.forEach(f => {
        let amount = ovBySF[`${stu.id}|${f.id}`] !== undefined
          ? parseFloat(ovBySF[`${stu.id}|${f.id}`])
          : (schedSumByFee[f.id] || parseFloat(f.amount));

        const disc = discBySF[`${stu.id}|${f.id}`];
        if (disc) {
          if (disc.discount_type === 'fixed') amount = Math.max(0, amount - parseFloat(disc.discount_value));
          else amount *= (1 - parseFloat(disc.discount_value) / 100);
        }
        expected += amount;

        const dates = schedDatesByFee[f.id] || [];
        dates.forEach(dueDate => {
          if (!dueDate) return;
          const d = new Date(dueDate);
          if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            hasDueThisMonth = true;
          }
        });
      });

      expected += optByStudent[stu.id] || 0;
      const paid = paidByStudent[stu.id] || 0;
      const balance = Math.max(0, expected - paid);

      results[stu.id] = {
        expected: parseFloat(expected.toFixed(2)),
        paid: parseFloat(paid.toFixed(2)),
        balance: parseFloat(balance.toFixed(2)),
        hasDueThisMonth,
      };
    });

    return results;
  }

  const getRecipients = async () => {
    let numbers = [];

    if (category === 'custom') {
      const raw = customRecipients.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      return raw.map(n => ({ number: n, name: 'Custom' }));
    }

    if (category === 'academic') {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, parent_phone, class_id, classes(name, level_id)')
        .eq('status', 'active')
        .not('parent_phone', 'is', null);

      if (error) return [];

      let filtered = (students || []).map(s => ({
        ...s,
        level_id: s.classes?.level_id,
        class_name: s.classes?.name,
      }));

      if (subCategory === 'kg') {
        filtered = filtered.filter(s => s.class_name?.toLowerCase().includes('kg'));
      } else if (subCategory === 'lower_primary') {
        filtered = filtered.filter(s => ['Primary 1', 'Primary 2', 'Primary 3'].includes(s.class_name));
      } else if (subCategory === 'upper_primary') {
        filtered = filtered.filter(s => ['Primary 4', 'Primary 5', 'Primary 6'].includes(s.class_name));
      } else if (subCategory === 'jhs') {
        filtered = filtered.filter(s => s.class_name?.toLowerCase().includes('jhs'));
      } else if (subCategory.startsWith('class_')) {
        const classId = subCategory.replace('class_', '');
        filtered = filtered.filter(s => s.class_id === classId);
      }

      numbers = filtered.map(s => ({
        number: s.parent_phone.trim(),
        name: `Parent of ${s.first_name} ${s.last_name}`,
        studentName: `${s.first_name} ${s.last_name}`,
      }));
    }

    if (category === 'financial') {
      const { data: students, error: studentsErr } = await supabase
        .from('students')
        .select('id, first_name, last_name, parent_phone, class_id, classes(name, level_id)')
        .eq('status', 'active')
        .not('parent_phone', 'is', null);

      if (studentsErr) return [];

      const enriched = (students || []).map(s => ({ ...s, level_id: s.classes?.level_id }));
      const balances = await calculateBalancesForStudents(enriched, academicYear, term);

      let filtered = students || [];

      if (subCategory === 'defaulters') {
        filtered = filtered.filter(s => (balances[s.id]?.balance || 0) > 0);
      } else if (subCategory === 'zero_payers') {
        filtered = filtered.filter(s => {
          const b = balances[s.id];
          return b && b.expected > 0 && b.paid === 0;
        });
      } else if (subCategory === 'high_debtors') {
        filtered = filtered.filter(s => {
          const b = balances[s.id];
          if (!b || b.expected === 0) return false;
          return (b.balance / b.expected) >= 0.5;
        });
      } else if (subCategory === 'due_this_month') {
        filtered = filtered.filter(s => {
          const b = balances[s.id];
          return b && b.hasDueThisMonth && b.balance > 0;
        });
      } else if (subCategory === 'fully_paid') {
        filtered = filtered.filter(s => {
          const b = balances[s.id];
          return b && b.expected > 0 && b.balance === 0;
        });
      }

      numbers = filtered.map(s => ({
        number: s.parent_phone.trim(),
        name: `Parent of ${s.first_name} ${s.last_name}`,
        studentName: `${s.first_name} ${s.last_name}`,
        balance: balances[s.id]?.balance || 0,
      }));
    }

    if (category === 'staff') {
      let query = supabase.from('staff').select('first_name, last_name, phone').eq('active', true).not('phone', 'is', null);
      if (subCategory === 'teaching') query = query.in('position', ['Teacher', 'Headmaster', 'Assistant Teacher']);
      else if (subCategory === 'non_teaching') query = query.in('position', ['Accountant', 'Secretary', 'Admin', 'Manager']);
      else if (subCategory === 'support') query = query.in('position', ['Security', 'Janitor', 'Cook', 'Driver', 'Groundsman']);
      else if (subCategory.startsWith('position_')) {
        const pos = subCategory.replace('position_', '');
        query = query.eq('position', pos);
      }
      const { data, error } = await query;
      if (error) return [];
      numbers = (data || []).map(s => ({ number: s.phone.trim(), name: `${s.first_name} ${s.last_name}` }));
    }

    return numbers.filter(({ number }) => {
      const cleaned = number.replace(/\s/g, '');
      return /^\d{10,}$/.test(cleaned);
    });
  };

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

    if (!window.confirm(`You are about to send this message to ${recipients.length} recipient(s). Confirm?`)) return;

    setSending(true);
    setStatusMessage('');

    let successCount = 0;
    let failCount = 0;

    for (const rec of recipients) {
      try {
        const cleanedNumber = rec.number.replace(/\s/g, '');
        const personalizedMessage = personalizeMessage(message.trim(), rec, term);

        const response = await supabase.functions.invoke('send-sms', {
          body: { phone: cleanedNumber, message: personalizedMessage },
        });

        const logBase = {
          recipient_number: cleanedNumber,
          message: personalizedMessage,
          sent_by: profile?.id,
          recipient_type: category === 'staff' ? 'staff' : 'parent',
          recipient_name: rec.name || '—',
          group_name: subCategory || category,
          academic_year: academicYear,
          term: (category === 'academic' || category === 'financial') ? term : null,
        };

        if (response.error) {
          failCount++;
          await supabase.from('sms_logs').insert({ ...logBase, status: 'failed', error_message: response.error.message || 'Unknown error' });
        } else {
          successCount++;
          await supabase.from('sms_logs').insert({ ...logBase, status: 'sent' });
        }
      } catch (err) {
        failCount++;
        await supabase.from('sms_logs').insert({
          recipient_number: rec.number,
          message: message.trim(),
          status: 'failed',
          sent_by: profile?.id,
          recipient_type: category === 'staff' ? 'staff' : 'parent',
          recipient_name: rec.name || '—',
          group_name: subCategory || category,
          academic_year: academicYear,
          term: (category === 'academic' || category === 'financial') ? term : null,
          error_message: err.message || 'Network error',
        });
      }
    }

    await fetchLogs();
    setStatusMessage(`${successCount} SMS sent, ${failCount} failed.`);
    setStatusType(successCount > 0 ? 'success' : 'error');
    setSending(false);

    if (successCount > 0) { setMessage(''); setCustomRecipients(''); }
  };

  const applyTemplate = (text) => setMessage(text);

  const getSubOptions = () => {
    if (category === 'academic') {
      const classOptions = classes.map(c => ({ value: `class_${c.id}`, label: c.name }));
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
        { value: 'defaulters',     label: 'All Defaulters (balance > 0)' },
        { value: 'zero_payers',    label: 'Zero Payers (no payment)' },
        { value: 'high_debtors',   label: 'High Debtors (≥ 50% unpaid)' },
        { value: 'due_this_month', label: 'Due This Month' },
        { value: 'fully_paid',     label: 'Fully Paid' },
      ];
    }
    if (category === 'staff') {
      const positionOptions = staffPositions.map(pos => ({ value: `position_${pos}`, label: pos }));
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

  const applySuggestedTemplate = () => {
    if (category === 'financial' && FINANCIAL_TEMPLATES[subCategory]) {
      setMessage(FINANCIAL_TEMPLATES[subCategory]);
    }
  };

  const getSubCategoryShortLabel = () => {
    const map = {
      defaulters:     'Defaulters',
      zero_payers:    'Zero Payers',
      high_debtors:   'High Debtors',
      due_this_month: 'Due This Month',
      fully_paid:     'Fully Paid',
    };
    return map[subCategory] || subCategory;
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
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Compose Message</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setCategory(newCat);
                    if (newCat === 'academic') setSubCategory('all_parents');
                    else if (newCat === 'financial') setSubCategory('defaulters');
                    else if (newCat === 'staff') setSubCategory('all_staff');
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

            {(category === 'academic' || category === 'financial') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                  <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                  <select value={term} onChange={(e) => setTerm(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}

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
                <span className={message.length > 160 ? 'text-amber-600 font-medium' : ''}>
                  {message.length} characters
                </span>
                <span>{Math.ceil(message.length / 160)} SMS</span>
              </div>
            </div>

            {/* ── TEMPLATES ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Templates</label>
              <div className="flex flex-wrap gap-2">
                {category === 'academic' && ACADEMIC_TEMPLATES.map((t, idx) => (
                  <button
                    key={idx}
                    onClick={() => applyTemplate(t.text)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1 rounded-full"
                  >
                    {t.name}
                  </button>
                ))}

                {category === 'financial' && FINANCIAL_TEMPLATES[subCategory] && (
                  <button
                    onClick={applySuggestedTemplate}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1 rounded-full"
                  >
                    {getSubCategoryShortLabel()}
                  </button>
                )}
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

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users size={18} /> About SMS
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2"><span className="text-blue-600">•</span><span>Each SMS can contain up to <strong>160 characters</strong>.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-600">•</span><span>Long messages are concatenated (up to 1600 characters).</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-600">•</span><span>Phone numbers must have at least <strong>10 digits</strong>.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-600">•</span><span>Only <strong>director</strong> and <strong>admin</strong> can send SMS.</span></li>
            </ul>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FileText size={18} /> Financial Groups
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>• <strong>Defaulters</strong> — outstanding balance</li>
              <li>• <strong>Zero Payers</strong> — no payment made</li>
              <li>• <strong>High Debtors</strong> — ≥ 50% unpaid</li>
              <li>• <strong>Due This Month</strong> — instalment due this month</li>
              <li>• <strong>Fully Paid</strong> — fully settled</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                <strong>Variables available:</strong><br />
                <code className="text-blue-600">[StudentName]</code> · <code className="text-blue-600">[Balance]</code> · <code className="text-blue-600">[Term]</code>
              </p>
            </div>
          </div>
        </div>
      </div>

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
                  <th className="text-left px-4 py-3">Period</th>
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
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {log.academic_year ? `${log.academic_year}${log.term ? ` · ${log.term}` : ''}` : '—'}
                    </td>
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