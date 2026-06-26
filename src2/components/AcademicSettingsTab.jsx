// src/components/AcademicSettingsTab.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PlusIcon, TrashIcon, PencilIcon, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const CYCLES = ['Nursery', 'KG', 'Primary', 'JHS'];
const ACADEMIC_YEARS = ['2024/2025', '2025/2026', '2026/2027'];

export default function AcademicSettingsTab() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Nouvelle matière locale
  const [newSubject, setNewSubject] = useState({ name: '', code: '', cycle: 'Primary', coefficient: 1 });
  const [showAddSubject, setShowAddSubject] = useState(false);

  // Assignation enseignant/matière/classe
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({
    class_id: '',
    subject_id: '',
    teacher_id: '',
    coefficient: 1,
    academic_year: '2025/2026',
  });

  // ─── NOUVEAU : Termes & Séquences ───────────────────────
  const [selectedYear, setSelectedYear] = useState('2025/2026');
  const [terms, setTerms] = useState([]);
  const [newTerm, setNewTerm] = useState({ name: '', term_number: 1, start_date: '', end_date: '' });
  const [showAddTerm, setShowAddTerm] = useState(false);

  const [termsLoaded, setTermsLoaded] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [subRes, clsRes, stfRes, csRes] = await Promise.all([
      supabase.from('subjects').select('*').order('cycle').order('order_index'),
      supabase.from('classes').select('id, name').order('name'),
      supabase.from('staff').select('id, first_name, last_name').eq('active', true).order('last_name'),
      supabase.from('class_subjects').select('id, class_id, subject_id, teacher_id, coefficient, academic_year, classes(name), subjects(name, cycle), staff(first_name, last_name)').order('academic_year', { ascending: false }),
    ]);
    setSubjects(subRes.data || []);
    setClasses(clsRes.data || []);
    setStaff(stfRes.data || []);
    setClassSubjects(csRes.data || []);
    setLoading(false);
  };

  // ─── TERMS & SEQUENCES ─────────────────────────────────
  const fetchTerms = async (year) => {
    const { data } = await supabase
      .from('academic_terms')
      .select('*, assessment_sequences(*)')
      .eq('academic_year', year)
      .order('term_number');
    setTerms(data || []);
    setTermsLoaded(true);
  };

  useEffect(() => {
    fetchTerms(selectedYear);
  }, [selectedYear]);

  const addTerm = async () => {
    if (!newTerm.name || !newTerm.start_date || !newTerm.end_date) return;
    const { error } = await supabase.from('academic_terms').insert({
      academic_year: selectedYear,
      term_number: newTerm.term_number,
      name: newTerm.name,
      start_date: newTerm.start_date,
      end_date: newTerm.end_date,
      is_active: true,
    });
    if (error) {
      toast.error('Error: ' + error.message);
    } else {
      toast.success('Term added');
      setNewTerm({ name: '', term_number: 1, start_date: '', end_date: '' });
      setShowAddTerm(false);
      fetchTerms(selectedYear);
    }
  };

  const deleteTerm = async (id) => {
    if (!confirm('Delete this term and its sequences?')) return;
    await supabase.from('academic_terms').delete().eq('id', id);
    toast.success('Term deleted');
    fetchTerms(selectedYear);
  };

  const addSequence = async (termId) => {
    // Valeurs par défaut
    const defaultMid = { term_id: termId, name: 'School-Based Assessment (SBA)', sequence_type: 'midterm', weight_percent: 50 };
    const defaultEnd = { term_id: termId, name: 'End-Term Exam', sequence_type: 'endterm', weight_percent: 50 };
    const { error } = await supabase.from('assessment_sequences').insert([defaultMid, defaultEnd]);
    if (error) {
      toast.error('Error: ' + error.message);
    } else {
      toast.success('Sequences added');
      fetchTerms(selectedYear);
    }
  };

  const toggleSequenceStatus = async (seqId, currentStatus) => {
    const newStatus = currentStatus === 'open' ? 'closed' : 'open';
    await supabase.from('assessment_sequences').update({ status: newStatus }).eq('id', seqId);
    fetchTerms(selectedYear);
  };

  const updateSequenceDates = async (seqId, openDate, closeDate) => {
    await supabase.from('assessment_sequences').update({ open_date: openDate, close_date: closeDate }).eq('id', seqId);
    fetchTerms(selectedYear);
  };

  // ─── RENDU ────────────────────────────────────────────
  const renderCycleSubjects = (cycle) => {
    const list = subjects.filter(s => s.cycle === cycle);
    if (list.length === 0) return <p className="text-gray-400 text-sm p-2">No subjects configured.</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-center px-3 py-2">Coeff.</th>
              <th className="text-center px-3 py-2">Active</th>
              <th className="text-center px-3 py-2">Type</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(sub => (
              <tr key={sub.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{sub.code}</td>
                <td className="px-3 py-2">{sub.name}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="number"
                    min="1"
                    value={sub.default_coefficient}
                    onChange={e => updateCoefficient(sub.id, e.target.value)}
                    className="w-16 text-center border rounded px-1 py-0.5 text-xs"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleActive(sub.id, sub.is_active)}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      sub.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {sub.is_active ? 'Yes' : 'No'}
                  </button>
                </td>
                <td className="px-3 py-2 text-center text-xs">
                  {sub.ges_default ? 'GES' : 'Local'}
                </td>
                <td className="px-3 py-2 text-center">
                  {sub.is_local && (
                    <button onClick={() => deleteLocalSubject(sub.id)} className="text-red-500 hover:text-red-700">
                      <TrashIcon size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Fonctions existantes (toggleActive, updateCoefficient...)
  const toggleActive = async (id, current) => {
    await supabase.from('subjects').update({ is_active: !current }).eq('id', id);
    fetchData();
  };

  const updateCoefficient = async (id, value) => {
    const coef = parseInt(value) || 1;
    await supabase.from('subjects').update({ default_coefficient: coef }).eq('id', id);
    fetchData();
  };

  const addLocalSubject = async () => {
    if (!newSubject.name.trim() || !newSubject.code.trim()) return;
    await supabase.from('subjects').insert({
      name: newSubject.name.trim(),
      code: newSubject.code.trim().toUpperCase(),
      cycle: newSubject.cycle,
      default_coefficient: newSubject.coefficient,
      ges_default: false,
      is_local: true,
      is_active: true,
    });
    setNewSubject({ name: '', code: '', cycle: 'Primary', coefficient: 1 });
    setShowAddSubject(false);
    fetchData();
  };

  const deleteLocalSubject = async (id) => {
    if (!confirm('Delete this local subject? It cannot be undone.')) return;
    await supabase.from('subjects').delete().eq('id', id);
    fetchData();
  };

  const assignTeacher = async () => {
    if (!assignForm.class_id || !assignForm.subject_id) return;
    await supabase.from('class_subjects').insert({
      class_id: assignForm.class_id,
      subject_id: assignForm.subject_id,
      teacher_id: assignForm.teacher_id || null,
      coefficient: assignForm.coefficient,
      academic_year: assignForm.academic_year,
    });
    setAssignForm({ class_id: '', subject_id: '', teacher_id: '', coefficient: 1, academic_year: '2025/2026' });
    setShowAssign(false);
    fetchData();
  };

  const removeAssignment = async (id) => {
    if (!confirm('Remove this assignment?')) return;
    await supabase.from('class_subjects').delete().eq('id', id);
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* ---- Subjects Management ---- */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Subject Management</h3>
          <button onClick={() => setShowAddSubject(true)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
            <PlusIcon size={16} /> Add Local Subject
          </button>
        </div>

        {CYCLES.map(cycle => (
          <div key={cycle} className="mb-6">
            <h4 className="font-medium text-blue-700 mb-2 border-b pb-1">{cycle} Cycle</h4>
            {renderCycleSubjects(cycle)}
          </div>
        ))}

        {showAddSubject && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-96">
              <h3 className="font-semibold text-lg mb-4">Add Local Subject</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Subject Name" value={newSubject.name}
                  onChange={e => setNewSubject({...newSubject, name: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <input type="text" placeholder="Code (e.g. DAG)" value={newSubject.code}
                  onChange={e => setNewSubject({...newSubject, code: e.target.value.toUpperCase()})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <select value={newSubject.cycle} onChange={e => setNewSubject({...newSubject, cycle: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm">
                  {CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="1" placeholder="Coefficient" value={newSubject.coefficient}
                  onChange={e => setNewSubject({...newSubject, coefficient: parseInt(e.target.value)||1})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <div className="flex gap-2 pt-2">
                  <button onClick={addLocalSubject} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Save</button>
                  <button onClick={() => setShowAddSubject(false)} className="border px-4 py-2 rounded text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Class Subject Assignments ---- */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Teacher Assignments (Class Subjects)</h3>
          <button onClick={() => setShowAssign(true)} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700">
            <PlusIcon size={16} /> New Assignment
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : classSubjects.length === 0 ? (
          <p className="text-gray-400 text-sm">No assignments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Class</th>
                  <th className="text-left px-3 py-2">Subject</th>
                  <th className="text-left px-3 py-2">Teacher</th>
                  <th className="text-center px-3 py-2">Coeff.</th>
                  <th className="text-left px-3 py-2">Year</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {classSubjects.map(cs => (
                  <tr key={cs.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{cs.classes?.name || '—'}</td>
                    <td className="px-3 py-2">{cs.subjects?.name} <span className="text-xs text-gray-400">({cs.subjects?.cycle})</span></td>
                    <td className="px-3 py-2">{cs.staff ? `${cs.staff.first_name} ${cs.staff.last_name}` : '—'}</td>
                    <td className="px-3 py-2 text-center">{cs.coefficient}</td>
                    <td className="px-3 py-2 text-xs">{cs.academic_year}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => removeAssignment(cs.id)} className="text-red-500 hover:text-red-700">
                        <TrashIcon size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showAssign && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-96">
              <h3 className="font-semibold text-lg mb-4">Assign Teacher to Class Subject</h3>
              <div className="space-y-3">
                <select value={assignForm.class_id} onChange={e => setAssignForm({...assignForm, class_id: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Select Class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={assignForm.subject_id} onChange={e => setAssignForm({...assignForm, subject_id: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Select Subject</option>
                  {subjects.filter(s => s.is_active).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.cycle})</option>
                  ))}
                </select>
                <select value={assignForm.teacher_id} onChange={e => setAssignForm({...assignForm, teacher_id: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Select Teacher (optional)</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                </select>
                <input type="number" min="1" placeholder="Coefficient" value={assignForm.coefficient}
                  onChange={e => setAssignForm({...assignForm, coefficient: parseInt(e.target.value)||1})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <input type="text" placeholder="Academic Year" value={assignForm.academic_year}
                  onChange={e => setAssignForm({...assignForm, academic_year: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <div className="flex gap-2 pt-2">
                  <button onClick={assignTeacher} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">Save</button>
                  <button onClick={() => setShowAssign(false)} className="border px-4 py-2 rounded text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ NOUVEAU : GESTION DES TERMES & SÉQUENCES ═══ */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Academic Terms & Assessment Sequences</h3>
          <div className="flex gap-2">
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="border rounded px-2 py-1 text-sm">
              {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => setShowAddTerm(true)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
              <PlusIcon size={16} /> Add Term
            </button>
          </div>
        </div>

        {terms.length === 0 ? (
          <p className="text-gray-400 text-sm">No terms defined for {selectedYear}. Click "Add Term" to begin.</p>
        ) : (
          <div className="space-y-4">
            {terms.map(term => (
              <div key={term.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <h4 className="font-medium text-gray-800">{term.name} (Term {term.term_number})</h4>
                    <p className="text-xs text-gray-500">{term.start_date} → {term.end_date}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => addSequence(term.id)} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">
                      + Add Sequences
                    </button>
                    <button onClick={() => deleteTerm(term.id)} className="text-red-500 hover:text-red-700">
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>

                {/* Séquences de ce terme */}
                {term.assessment_sequences && term.assessment_sequences.length > 0 ? (
                  <table className="w-full text-xs mt-2">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-2 py-1">Name</th>
                        <th className="text-left px-2 py-1">Type</th>
                        <th className="text-center px-2 py-1">Weight %</th>
                        <th className="text-left px-2 py-1">Open Date</th>
                        <th className="text-left px-2 py-1">Close Date</th>
                        <th className="text-center px-2 py-1">Status</th>
                        <th className="px-2 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {term.assessment_sequences.map(seq => (
                        <tr key={seq.id}>
                          <td className="px-2 py-1">{seq.name}</td>
                          <td className="px-2 py-1 capitalize">{seq.sequence_type}</td>
                          <td className="px-2 py-1 text-center">{seq.weight_percent}%</td>
                          <td className="px-2 py-1">
                            <input
                              type="date"
                              defaultValue={seq.open_date}
                              onBlur={e => updateSequenceDates(seq.id, e.target.value, seq.close_date)}
                              className="border rounded px-1 py-0.5 text-xs w-28"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="date"
                              defaultValue={seq.close_date}
                              onBlur={e => updateSequenceDates(seq.id, seq.open_date, e.target.value)}
                              className="border rounded px-1 py-0.5 text-xs w-28"
                            />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <button
                              onClick={() => toggleSequenceStatus(seq.id, seq.status)}
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                seq.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                              }`}
                            >
                              {seq.status === 'open' ? 'Open' : 'Closed'}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-center">
                            {/* Optionnel : supprimer une séquence */}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-gray-400 italic mt-2">No sequences yet. Click "Add Sequences" to create Mid-Term and End-of-Term.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal Add Term */}
        {showAddTerm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-96">
              <h3 className="font-semibold text-lg mb-4">Add Academic Term</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Term Name (e.g. Term 1)" value={newTerm.name}
                  onChange={e => setNewTerm({...newTerm, name: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <input type="number" min="1" max="4" placeholder="Term Number" value={newTerm.term_number}
                  onChange={e => setNewTerm({...newTerm, term_number: parseInt(e.target.value)||1})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <label className="text-xs text-gray-500">Start Date</label>
                <input type="date" value={newTerm.start_date}
                  onChange={e => setNewTerm({...newTerm, start_date: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <label className="text-xs text-gray-500">End Date</label>
                <input type="date" value={newTerm.end_date}
                  onChange={e => setNewTerm({...newTerm, end_date: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm" />
                <div className="flex gap-2 pt-2">
                  <button onClick={addTerm} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Save</button>
                  <button onClick={() => setShowAddTerm(false)} className="border px-4 py-2 rounded text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}