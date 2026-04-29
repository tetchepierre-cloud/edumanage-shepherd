// src/pages/FeeManagementPage.jsx
// Corrections appliquées :
// [1] generateYears() — currentYear est TOUJOURS placé en premier → sélectionné par défaut
// [2] Fallback : si app_settings vide, on détecte l'année depuis les fee_payments existants
// [3] Fallback niveau : on ne présélectionne pas KG 1 aveuglément — on attend les données

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  AcademicCapIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';

const FEE_TYPES = ['tuition', 'exam', 'canteen', 'transport', 'uniform', 'other'];
const FEE_TYPE_LABELS = {
  tuition: 'Tuition', exam: 'Exam', canteen: 'Canteen',
  transport: 'Transport', uniform: 'Uniform', other: 'Other',
};
const FEE_TYPE_COLORS = {
  tuition: 'bg-blue-100 text-blue-800', exam: 'bg-purple-100 text-purple-800',
  canteen: 'bg-green-100 text-green-800', transport: 'bg-yellow-100 text-yellow-800',
  uniform: 'bg-pink-100 text-pink-800', other: 'bg-gray-100 text-gray-800',
};
const EMPTY_FEE_FORM = { fee_name: '', fee_type: 'tuition', amount: '', is_mandatory: true, is_active: true };

export default function FeeManagementPage() {
  const [activeTab, setActiveTab] = useState('structure');
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fee Management</h1>
        <p className="text-sm text-gray-500 mt-1">Manage fee structures, payment schedules, and collect payments</p>
      </div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'structure',  label: 'Fee Structure',      icon: CurrencyDollarIcon },
            { id: 'schedules',  label: 'Payment Schedules',  icon: CalendarIcon },
            { id: 'collection', label: 'Fee Collection',     icon: AcademicCapIcon },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
      </div>
      {activeTab === 'structure'  && <FeeStructureTab />}
      {activeTab === 'schedules'  && <PaymentSchedulesTab />}
      {activeTab === 'collection' && <FeeCollectionTab />}
    </div>
  );
}

// ─── TAB 1: FEE STRUCTURE ────────────────────────────────────────────────────
function FeeStructureTab() {
  const [levels, setLevels]               = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear]   = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [fees, setFees]                   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [editingFee, setEditingFee]       = useState(null);
  const [toast, setToast]                 = useState(null);

  useEffect(() => { loadInitialData(); }, []);

  useEffect(() => {
    if (selectedYear && selectedLevel) loadFees(selectedYear, selectedLevel);
  }, [selectedYear, selectedLevel]);

  // [FIX #1] generateYears — currentYear est TOUJOURS premier dans la liste
  function generateYears(currentYear) {
    if (!currentYear) return ['2024/2025', '2025/2026'];
    const match = currentYear.match(/(\d{4})\/(\d{4})/);
    if (!match) return [currentYear];
    const start = parseInt(match[1]);
    // currentYear est TOUJOURS en position 0 → sélectionné par défaut
    return [
      currentYear,
      `${start - 1}/${start}`,      // année précédente
      `${start + 1}/${start + 2}`,  // année suivante
    ];
  }

  async function loadInitialData() {
    // Charger les niveaux
    const { data: lvls } = await supabase
      .from('levels')
      .select('id, name, cycle, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    setLevels(lvls || []);

    // [FIX #1] Lire l'année depuis app_settings
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'academic')
      .single();

    let currentYear = setting?.value?.current_year || '';

    // [FIX #2] Fallback : détecter l'année depuis fee_payments si app_settings vide
    if (!currentYear) {
      const { data: fpRow } = await supabase
        .from('fee_payments')
        .select('academic_year')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      currentYear = fpRow?.academic_year || '';
    }

    // [FIX #2] Fallback final : année courante calculée
    if (!currentYear) {
      const now = new Date();
      const y = now.getFullYear();
      currentYear = now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    }

    const years = generateYears(currentYear);
    setAcademicYears(years);

    // [FIX #1+3] currentYear est en index 0 → toujours sélectionné par défaut
    const finalYear  = years[0];
    const finalLevel = lvls?.[0]?.id || '';

    setSelectedYear(finalYear);
    setSelectedLevel(finalLevel);

    // Chargement direct (évite race condition useEffect)
    if (finalYear && finalLevel) {
      await loadFees(finalYear, finalLevel);
    }
  }

  async function loadFees(year, level) {
    setLoading(true);
    const { data, error } = await supabase
      .from('fee_structure')
      .select('id, fee_name, fee_type, amount, is_mandatory, is_active, academic_year, levels(name)')
      .eq('level_id', level)
      .eq('academic_year', year)
      .order('is_mandatory', { ascending: false })
      .order('fee_name');
    if (!error) setFees(data || []);
    setLoading(false);
  }

  async function handleSaveFee(formData) {
    const payload = { ...formData, amount: parseFloat(formData.amount), level_id: selectedLevel, academic_year: selectedYear };
    let error;
    if (editingFee) {
      ({ error } = await supabase.from('fee_structure').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingFee.id));
    } else {
      ({ error } = await supabase.from('fee_structure').insert(payload));
    }
    if (error) { 
  console.error('FULL ERROR:', JSON.stringify(error));
  showToastMsg('Error: ' + error.message + ' | ' + error.details + ' | ' + error.hint, 'error'); 
}
    else {
      showToastMsg(editingFee ? 'Fee updated' : 'Fee created', 'success');
      setShowModal(false);
      setEditingFee(null);
      loadFees(selectedYear, selectedLevel);
    }
  }

  async function handleToggleActive(fee) {
    const { error } = await supabase.from('fee_structure')
      .update({ is_active: !fee.is_active, updated_at: new Date().toISOString() }).eq('id', fee.id);
    if (!error) { showToastMsg(`Fee ${!fee.is_active ? 'activated' : 'deactivated'}`, 'success'); loadFees(selectedYear, selectedLevel); }
  }

  async function handleDelete(fee) {
    if (!confirm(`Delete "${fee.fee_name}"? This cannot be undone.`)) return;
    const { count } = await supabase.from('student_fees').select('id', { count: 'exact', head: true }).eq('fee_structure_id', fee.id);
    if (count > 0) { showToastMsg(`Cannot delete: ${count} student(s) have this fee. Deactivate instead.`, 'error'); return; }
    const { error } = await supabase.from('fee_structure').delete().eq('id', fee.id);
    if (!error) { showToastMsg('Fee deleted', 'success'); loadFees(selectedYear, selectedLevel); }
  }

  function showToastMsg(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const totalMandatory = fees.filter(f => f.is_mandatory && f.is_active).reduce((s, f) => s + Number(f.amount), 0);
  const totalOptional  = fees.filter(f => !f.is_mandatory && f.is_active).reduce((s, f) => s + Number(f.amount), 0);
  const selectedLevelName = levels.find(l => l.id === selectedLevel)?.name || '';

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircleIcon className="h-5 w-5" /> : <ExclamationTriangleIcon className="h-5 w-5" />}
          {toast.message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
            <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-[160px]">
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {/* [FIX] Indicator: shows which year/level is active */}
          {selectedYear && selectedLevel && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              <span className="font-semibold">Viewing:</span> {selectedLevelName} · {selectedYear}
            </div>
          )}
          <div className="ml-auto pt-5">
            <button onClick={() => { setEditingFee(null); setShowModal(true); }}
              disabled={!selectedYear || !selectedLevel}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              <PlusIcon className="h-4 w-4" /> Add Fee
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      {selectedLevel && selectedYear && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium">Level</p>
            <p className="text-lg font-bold text-blue-900 mt-1">{selectedLevelName}</p>
            <p className="text-xs text-blue-600">{selectedYear}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-600 font-medium">Mandatory Fees Total</p>
            <p className="text-lg font-bold text-green-900 mt-1">
              GHS {totalMandatory.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-green-600">{fees.filter(f => f.is_mandatory && f.is_active).length} fee(s)</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-600 font-medium">Optional Fees Total</p>
            <p className="text-lg font-bold text-amber-900 mt-1">
              GHS {totalOptional.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-amber-600">{fees.filter(f => !f.is_mandatory && f.is_active).length} fee(s)</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : fees.length === 0 ? (
          <div className="text-center py-16">
            <CurrencyDollarIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No fees configured</p>
            <p className="text-gray-400 text-sm mt-1">
              {selectedYear && selectedLevel
                ? `No fees found for ${selectedLevelName} in ${selectedYear}. Click "Add Fee" to create one.`
                : 'Select a level and year to get started.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Fee Name','Type','Amount','Mandatory','Status','Actions'].map(h => (
                  <th key={h} className={`text-xs font-semibold text-gray-500 uppercase px-6 py-3 ${h === 'Amount' ? 'text-right' : h === 'Mandatory' || h === 'Status' || h === 'Actions' ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fees.map(fee => (
                <tr key={fee.id} className={`hover:bg-gray-50 transition-colors ${!fee.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4 font-medium text-gray-900">{fee.fee_name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${FEE_TYPE_COLORS[fee.fee_type] || FEE_TYPE_COLORS.other}`}>
                      {FEE_TYPE_LABELS[fee.fee_type] || fee.fee_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                    GHS {Number(fee.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {fee.is_mandatory
                      ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Required</span>
                      : <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Optional</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => handleToggleActive(fee)}
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        fee.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {fee.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { setEditingFee(fee); setShowModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(fee)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={2} className="px-6 py-3 text-sm font-semibold text-gray-700">Total (active fees)</td>
                <td className="px-6 py-3 text-right font-bold text-gray-900">
                  GHS {(totalMandatory + totalOptional).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {showModal && (
        <FeeFormModal
          fee={editingFee}
          levelName={selectedLevelName}
          academicYear={selectedYear}
          onSave={handleSaveFee}
          onClose={() => { setShowModal(false); setEditingFee(null); }}
        />
      )}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function FeeFormModal({ fee, levelName, academicYear, onSave, onClose }) {
  const [form, setForm] = useState(
    fee ? { fee_name: fee.fee_name, fee_type: fee.fee_type, amount: fee.amount, is_mandatory: fee.is_mandatory, is_active: fee.is_active }
        : EMPTY_FEE_FORM
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!form.fee_name.trim()) e.fee_name = 'Fee name is required';
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = 'Valid amount required';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{fee ? 'Edit Fee' : 'New Fee'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{levelName} · {academicYear}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.fee_name} onChange={e => setForm({ ...form, fee_name: e.target.value })}
              placeholder="e.g. School Fees, Exam Fees..."
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${errors.fee_name ? 'border-red-400' : 'border-gray-300'}`} />
            {errors.fee_name && <p className="text-red-500 text-xs mt-1">{errors.fee_name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
            <select value={form.fee_type} onChange={e => setForm({ ...form, fee_type: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {FEE_TYPES.map(t => <option key={t} value={t}>{FEE_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS) <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">GHS</span>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00"
                className={`w-full border rounded-lg pl-12 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${errors.amount ? 'border-red-400' : 'border-gray-300'}`} />
            </div>
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={form.is_mandatory} onChange={e => setForm({ ...form, is_mandatory: e.target.checked })} className="h-4 w-4 text-blue-600 rounded" />
              <span className="text-sm font-medium text-gray-700">Mandatory</span>
            </label>
            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 text-blue-600 rounded" />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>
          {!form.is_mandatory && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              ⚠️ Optional fees must be manually assigned to individual students.
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : fee ? 'Update Fee' : 'Create Fee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── TAB 2 & 3: Placeholders ─────────────────────────────────────────────────
function PaymentSchedulesTab() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
      <CalendarIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">Payment Schedules</p>
      <p className="text-gray-400 text-sm mt-1">Coming next...</p>
    </div>
  );
}

function FeeCollectionTab() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
      <AcademicCapIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">Fee Collection</p>
      <p className="text-gray-400 text-sm mt-1">Coming next...</p>
    </div>
  );
}
