// C:\EduManage\app\src\pages\StockPage.jsx
// Version 3.1 - Restored tabs + fixed filtering + RPC integration

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================
// TOAST COMPONENT
// ============================================================
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-white shadow-lg ${colors[type] || colors.info}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-white hover:text-gray-200 text-lg leading-none">×</button>
    </div>
  );
};

// ============================================================
// ADD ITEM MODAL
// ============================================================
const AddItemModal = ({ onClose, onSuccess, showToast, existingItems }) => {
  const [form, setForm] = useState({
    name: '', category: '', unit: '', unit_price: '',
    minimum_stock: '10', supplier: '', notes: '', initial_stock: '0',
  });
  const [loading, setLoading] = useState(false);
  const [duplicateStatus, setDuplicateStatus] = useState(null);
  // null | { type: 'exact', name } | { type: 'similar', matches: [] }

  const CATEGORIES = [
  'Books & Textbooks',
  'Stationery',
  'Furniture',
  'Electronics',
  'ICT Equipment',
  'Cleaning Supplies',
  'Sports & P.E.',
  'Canteen / Feeding',
  'Art & Creative',
  'Uniforms & Clothing',
  'Health & First Aid',
  'Transport',
  'General Supplies',
  'Other'
];

const UNITS = [
  'pieces',
  'boxes',
  'reams',
  'sets',
  'kg',
  'litres',
  'rolls',
  'packets',
  'copies',
  'titles',
  'units',
  'bottles',
  'tubes',
  'pairs',
  'dozens',
  'bags',
  'cartons',
  'tins',
  'packs'
];
  const checkDuplicate = useCallback((value) => {
    if (!value.trim()) { setDuplicateStatus(null); return; }
    const lower = value.trim().toLowerCase();
    const activeItems = existingItems.filter(i => i.is_active);
    const exact = activeItems.find(i => i.name.toLowerCase() === lower);
    if (exact) { setDuplicateStatus({ type: 'exact', name: exact.name }); return; }
    const similar = activeItems.filter(i =>
      i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase())
    );
    setDuplicateStatus(similar.length > 0 ? { type: 'similar', matches: similar } : null);
  }, [existingItems]);

  const handleNameChange = (e) => {
    setForm(f => ({ ...f, name: e.target.value }));
    checkDuplicate(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (duplicateStatus?.type === 'exact') {
      showToast('Un article avec ce nom existe déjà !', 'error');
      return;
    }
    if (!form.name.trim() || !form.category || !form.unit) {
      showToast('Veuillez remplir tous les champs obligatoires', 'error');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('stock_items').insert([{
        name: form.name.trim(),
        category: form.category,
        unit: form.unit,
        unit_price: parseFloat(form.unit_price) || 0,
        minimum_stock: parseInt(form.minimum_stock) || 10,
        supplier: form.supplier.trim(),
        notes: form.notes.trim(),
        initial_stock: parseInt(form.initial_stock) || 0,
        is_active: true,
      }]);
      if (error) throw error;
      showToast(`"${form.name}" ajouté avec succès !`, 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast('Erreur: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-800">➕ Add New Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <input
              type="text" value={form.name} onChange={handleNameChange}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
                duplicateStatus?.type === 'exact'
                  ? 'border-red-400 focus:ring-red-300'
                  : duplicateStatus?.type === 'similar'
                  ? 'border-yellow-400 focus:ring-yellow-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
              placeholder="e.g. Exercise Books"
            />
            {duplicateStatus?.type === 'exact' && (
              <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                🚫 <strong>"{duplicateStatus.name}"</strong> existe déjà. Soumission bloquée.
              </div>
            )}
            {duplicateStatus?.type === 'similar' && (
              <div className="mt-1 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-xs">
                ⚠️ Articles similaires trouvés : {duplicateStatus.matches.map(m => `"${m.name}"`).join(', ')}
              </div>
            )}
          </div>

          {/* Category & Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">Select...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">Select...</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Unit Price & Min Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (GHS)</label>
              <input type="number" min="0" step="0.01" value={form.unit_price}
                onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Alert</label>
              <input type="number" min="0" value={form.minimum_stock}
                onChange={e => setForm(f => ({ ...f, minimum_stock: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>

          {/* Initial Stock & Supplier */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock</label>
              <input type="number" min="0" value={form.initial_stock}
                onChange={e => setForm(f => ({ ...f, initial_stock: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <input type="text" value={form.supplier}
                onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Supplier name" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={2} placeholder="Optional notes..." />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading || duplicateStatus?.type === 'exact'}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Saving...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// MOVEMENT MODAL (IN / OUT)
// ============================================================
const MovementModal = ({ item, movementType, onClose, onSuccess, showToast }) => {
  const [form, setForm] = useState({ quantity: '', reason: '', notes: '', unit_cost: '' });
  const [loading, setLoading] = useState(false);

  const IN_REASONS = ['Purchase', 'Donation', 'Return', 'Correction', 'Initial Stock'];
  const OUT_REASONS = ['Usage', 'Damage', 'Loss', 'Correction', 'Other'];
  const reasons = movementType === 'IN' ? IN_REASONS : OUT_REASONS;

  const isIN = movementType === 'IN';
  const headerColor = isIN ? 'bg-green-600' : 'bg-red-600';
  const btnColor = isIN ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';
  const icon = isIN ? '📥' : '📤';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseInt(form.quantity);
    if (!qty || qty <= 0) { showToast('Quantité invalide', 'error'); return; }
    if (!form.reason) { showToast('Veuillez sélectionner une raison', 'error'); return; }
    if (!isIN && qty > item.quantity) {
      showToast(`Stock insuffisant ! Disponible: ${item.quantity} ${item.unit}`, 'error');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('record_stock_movement', {
        p_stock_item_id: item.id,
        p_type: movementType,
        p_quantity: qty,
        p_reason: form.reason,
        p_notes: form.notes.trim() || null,
        p_unit_cost: parseFloat(form.unit_cost) || null,
      });
      if (error) throw error;
      showToast(`${icon} Mouvement enregistré ! Réf: ${data}`, 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast('Erreur: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className={`flex items-center justify-between p-5 ${headerColor} rounded-t-xl`}>
          <h2 className="text-lg font-bold text-white">{icon} Stock {movementType} — {item.name}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Current Stock Info */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <span className="text-gray-500">Current Stock: </span>
            <span className="font-bold text-gray-800">{item.quantity} {item.unit}</span>
            {!isIN && (
              <span className="ml-3 text-gray-500">→ After: <strong className={parseInt(form.quantity) > item.quantity ? 'text-red-600' : 'text-green-600'}>
                {item.quantity - (parseInt(form.quantity) || 0)} {item.unit}
              </strong></span>
            )}
            {isIN && form.quantity && (
              <span className="ml-3 text-gray-500">→ After: <strong className="text-green-600">
                {item.quantity + (parseInt(form.quantity) || 0)} {item.unit}
              </strong></span>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
            <input type="number" min="1" value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Enter quantity" autoFocus />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">Select reason...</option>
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Unit Cost (IN only) */}
          {isIN && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (GHS)</label>
              <input type="number" min="0" step="0.01" value={form.unit_cost}
                onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Optional" />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={2} placeholder="Optional notes..." />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className={`flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 ${btnColor}`}>
              {loading ? 'Processing...' : `Confirm ${movementType}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// HISTORY MODAL
// ============================================================
const HistoryModal = ({ item, onClose }) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('stock_item_id', item.id)
        .order('created_at', { ascending: false });
      if (!error) setMovements(data || []);
      setLoading(false);
    };
    fetchHistory();
  }, [item.id]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 bg-gray-800 rounded-t-xl">
          <h2 className="text-lg font-bold text-white">📋 History — {item.name}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No movements recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 uppercase text-xs">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>{m.type}</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.type === 'IN' ? '+' : '-'}{m.quantity}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{m.reason}</td>
                    <td className="px-3 py-2 text-gray-400 font-mono text-xs">{m.reference}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="p-4 border-t text-right">
          <button onClick={onClose}
            className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN STOCK PAGE
// ============================================================
export default function StockPage() {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [toast, setToast] = useState(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [movementModal, setMovementModal] = useState(null); // { item, type }
  const [historyModal, setHistoryModal] = useState(null);   // item

  const showToast = (message, type = 'info') => setToast({ message, type });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_items_with_quantity')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) { showToast('Erreur chargement: ' + error.message, 'error'); }
    else { setItems(data || []); }
    setLoading(false);
  }, []);


  const fetchMovements = useCallback(async () => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select(`*, stock_items(name, unit)`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error) setMovements(data || []);
  }, []);

  useEffect(() => {
    fetchItems();
    fetchMovements();
  }, [fetchItems, fetchMovements]);

  // ── Client-side Filtering (no supabase.raw) ─────────────
  const filteredItems = items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = filterCategory === 'all' || item.category === filterCategory;
    const matchStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'out' ? item.quantity <= 0 :
      filterStatus === 'low' ? item.quantity > 0 && item.quantity <= item.minimum_stock :
      filterStatus === 'ok'  ? item.quantity > item.minimum_stock : true;
    return matchSearch && matchCategory && matchStatus;
  });

  const filteredMovements = movements.filter(m => {
    const itemName = m.stock_items?.name || '';
    return itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.reason || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  // ── Categories from data ─────────────────────────────────
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();

  // ── Stats ────────────────────────────────────────────────
  const stats = {
    total: items.length,
    outOfStock: items.filter(i => i.quantity <= 0).length,
    lowStock: items.filter(i => i.quantity > 0 && i.quantity <= i.minimum_stock).length,
    totalValue: items.reduce((sum, i) => sum + (i.quantity * (i.unit_price || 0)), 0),
  };

  // ── Stock Status Badge ───────────────────────────────────
  const getStatusBadge = (item) => {
    if (item.quantity <= 0)
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">Out of Stock</span>;
    if (item.quantity <= item.minimum_stock)
      return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-semibold">Low Stock</span>;
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-semibold">In Stock</span>;
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Modals */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { fetchItems(); fetchMovements(); }}
          showToast={showToast}
          existingItems={items}
        />
      )}
      {movementModal && (
        <MovementModal
          item={movementModal.item}
          movementType={movementModal.type}
          onClose={() => setMovementModal(null)}
          onSuccess={() => { fetchItems(); fetchMovements(); }}
          showToast={showToast}
        />
      )}
      {historyModal && (
        <HistoryModal item={historyModal} onClose={() => setHistoryModal(null)} />
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📦 Stock Management</h1>
          <p className="text-gray-500 text-sm mt-1">Inventory tracking & movement ledger</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition">
          ➕ Add Item
        </button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: stats.total, icon: '📦', color: 'blue', onClick: () => { setFilterStatus('all'); setActiveTab('inventory'); } },
          { label: 'Out of Stock', value: stats.outOfStock, icon: '🚫', color: 'red', onClick: () => { setFilterStatus('out'); setActiveTab('inventory'); } },
          { label: 'Low Stock', value: stats.lowStock, icon: '⚠️', color: 'yellow', onClick: () => { setFilterStatus('low'); setActiveTab('inventory'); } },
          { label: 'Total Value', value: `GHS ${stats.totalValue.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`, icon: '💰', color: 'green', onClick: null },
        ].map(card => (
          <div key={card.label}
            onClick={card.onClick}
            className={`bg-white rounded-xl p-4 shadow-sm border border-gray-100 ${card.onClick ? 'cursor-pointer hover:shadow-md transition' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 text-${card.color}-600`}>{card.value}</p>
              </div>
              <span className="text-3xl">{card.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b">
          {[
            { id: 'inventory', label: '📋 Inventory', count: filteredItems.length },
            { id: 'ledger', label: '📒 Movements LEDGER', count: movements.length },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 font-medium text-sm border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* ── Filters Bar ── */}
        <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-3">
          <input
            type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder={activeTab === 'inventory' ? '🔍 Search items...' : '🔍 Search movements...'}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {activeTab === 'inventory' && (
            <>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="all">All Status</option>
                <option value="ok">✅ In Stock</option>
                <option value="low">⚠️ Low Stock</option>
                <option value="out">🚫 Out of Stock</option>
              </select>
            </>
          )}
        </div>

        {/* ── Tab Content ── */}
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">📦</div>
            <p>Loading inventory...</p>
          </div>
        ) : (
          <>
            {/* INVENTORY TAB */}
            {activeTab === 'inventory' && (
              <div className="overflow-x-auto">
                {filteredItems.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <div className="text-4xl mb-3">🔍</div>
                    <p>No items found matching your filters.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 uppercase text-xs">
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3 text-right">Min Stock</th>
                        <th className="px-4 py-3 text-right">Unit Price</th>
                        <th className="px-4 py-3 text-right">Total Value</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map(item => (
                        <tr key={item.id} className="border-b hover:bg-gray-50 transition">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{item.name}</div>
                            {item.supplier && <div className="text-xs text-gray-400">{item.supplier}</div>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{item.category}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-800">
                            {item.quantity} <span className="text-gray-400 font-normal text-xs">{item.unit}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{item.minimum_stock}</td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {item.unit_price ? `GHS ${parseFloat(item.unit_price).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-700">
                            {item.unit_price ? `GHS ${(item.quantity * item.unit_price).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-3">{getStatusBadge(item)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setMovementModal({ item, type: 'IN' })}
                                className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 transition"
                                title="Stock IN">
                                📥 IN
                              </button>
                              <button
                                onClick={() => setMovementModal({ item, type: 'OUT' })}
                                className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition"
                                title="Stock OUT">
                                📤 OUT
                              </button>
                              <button
                                onClick={() => setHistoryModal(item)}
                                className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200 transition"
                                title="History">
                                📋
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* LEDGER TAB */}
            {activeTab === 'ledger' && (
              <div className="overflow-x-auto">
                {filteredMovements.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <div className="text-4xl mb-3">📒</div>
                    <p>No movements recorded yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 uppercase text-xs">
                        <th className="px-4 py-3 text-left">Date & Time</th>
                        <th className="px-4 py-3 text-left">Reference</th>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-center">Type</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3 text-left">Reason</th>
                        <th className="px-4 py-3 text-right">Unit Cost</th>
                        <th className="px-4 py-3 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.map(m => (
                        <tr key={m.id} className="border-b hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                            {new Date(m.created_at).toLocaleDateString('en-GB', {
                              day: '2-digit', month: 'short', year: 'numeric'
                            })}
                            <br />
                            <span className="text-gray-400">
                              {new Date(m.created_at).toLocaleTimeString('en-GB', {
                                hour: '2-digit', minute: '2-digit'
                              })}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-blue-600">{m.reference}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {m.stock_items?.name || '—'}
                            <div className="text-xs text-gray-400">{m.stock_items?.unit}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>{m.type}</span>
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${
                            m.type === 'IN' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {m.type === 'IN' ? '+' : '-'}{m.quantity}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.reason}</td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {m.unit_cost ? `GHS ${parseFloat(m.unit_cost).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-32 truncate">
                            {m.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
