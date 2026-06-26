// src2/pages/StockPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CanAct, CanSee } from '../components/PermissionGate';

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
// STANDARD INVENTORY CATEGORIES (as in school 1)
// ============================================================
const INVENTORY_CATEGORIES = [
  'Stationery',
  'Furniture',
  'Cleaning Supplies',
  'Electronics',
  'Sports & P.E.',
  'Uniforms & Clothing',
  'Textbooks & Books',
  'Canteen Supplies',
  'Medical Supplies',
  'ICT Equipment',
  'Art & Creative',
  'General',
];

const INVENTORY_UNITS = [
  'pcs',
  'box',
  'pack',
  'ream',
  'set',
  'pair',
  'dozen',
  'kg',
  'g',
  'L',
  'mL',
  'm',
  'cm',
  'roll',
  'bottle',
  'tube',
  'carton',
  'piece',
  'unit',
];

// ============================================================
// ADD ITEM MODAL
// ============================================================
const AddItemModal = ({ onClose, onSuccess, showToast, existingItems }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', category: '', unit: '', unit_price: '', minimum_stock: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (existingItems?.some(i => i.name.toLowerCase() === form.name.trim().toLowerCase())) {
        throw new Error("An item with this name already exists in inventory.");
      }

      const { error } = await supabase.from('stock_items').insert([{
        name: form.name.trim(),
        category: form.category || 'General',
        unit: form.unit.trim() || 'pcs',
        unit_price: parseFloat(form.unit_price) || 0,
        minimum_stock: parseInt(form.minimum_stock) || 0,
        is_active: true
      }]);

      if (error) throw error;
      
      showToast('Item added successfully', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">➕ New Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">-- Select Category --</option>
                {INVENTORY_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">-- Select Unit --</option>
                {INVENTORY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (GHS)</label>
              <input type="number" step="0.01" min="0" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock</label>
              <input type="number" min="0" value={form.minimum_stock} onChange={e => setForm({...form, minimum_stock: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t mt-6">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition flex justify-center items-center">
              {saving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : 'Save Item'}
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ quantity: '', reason: '', unit_cost: '', reference: '', notes: '' });

  const isIN = movementType === 'IN';
  const defaultReasons = isIN 
    ? ['Purchase', 'Donation', 'Return', 'Correction', 'Initial Stock'] 
    : ['Usage', 'Damage', 'Loss', 'Correction', 'Other'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const qty = parseFloat(form.quantity);
      if (qty <= 0) throw new Error("Quantity must be greater than 0.");
      if (!isIN && qty > item.quantity) throw new Error("Insufficient stock for this withdrawal.");

      const payload = {
        stock_item_id: item.id,
        type: movementType,
        quantity: qty,
        reason: form.reason || defaultReasons[0],
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
        unit_cost: isIN ? (parseFloat(form.unit_cost) || null) : null
      };

      const { error } = await supabase.from('stock_movements').insert([payload]);
      
      if (error) throw error;

      showToast(`Stock ${movementType} recorded successfully`, 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className={`p-5 border-b flex justify-between items-center ${isIN ? 'bg-green-50' : 'bg-red-50'}`}>
          <h2 className={`text-lg font-bold ${isIN ? 'text-green-800' : 'text-red-800'}`}>
            {isIN ? '📥 Stock IN' : '📤 Stock OUT'} - {item.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm border border-gray-100">
            <span className="text-gray-500">Current Stock:</span>
            <span className="font-bold text-gray-800">{item.quantity} {item.unit}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input required type="number" step="0.01" min="0.01" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <select value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {defaultReasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {isIN && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (GHS) - Optional</label>
              <input type="number" step="0.01" min="0" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference (Receipt, Invoice...)</label>
            <input type="text" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"></textarea>
          </div>

          <div className="flex gap-3 pt-4 border-t mt-6">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition flex justify-center items-center ${isIN ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50`}>
              {saving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : 'Confirm'}
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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('stock_item_id', item.id)
        .order('created_at', { ascending: false });
      
      if (!error) setHistory(data || []);
      setLoading(false);
    };
    fetchHistory();
  }, [item.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">📋 History: {item.name}</h2>
            <p className="text-sm text-gray-500 mt-1">Current Total: {item.quantity} {item.unit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-3xl mb-2">📭</p>
              <p>No movements recorded for this item.</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-center">Type</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(m.created_at).toLocaleDateString('en-GB')}
                        <span className="text-xs text-gray-400 block">
                          {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {m.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                        {m.type === 'IN' ? '+' : '-'}{m.quantity}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{m.reason}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.reference || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg font-medium transition">
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [movementModal, setMovementModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

  const showToast = (message, type = 'info') => setToast({ message, type });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_items_with_quantity')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) { showToast('Error loading: ' + error.message, 'error'); }
    else { setItems(data || []); }
    setLoading(false);
  }, []);

  const fetchMovements = useCallback(async () => {
    const { data, error } = await supabase
      .from('stock_movements_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error) setMovements(data || []);
  }, []);

  useEffect(() => {
    fetchItems();
    fetchMovements();
  }, [fetchItems, fetchMovements]);

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
    const itemName = m.item_name || '';
    return itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.reason || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();

  const stats = {
    total: items.length,
    outOfStock: items.filter(i => i.quantity <= 0).length,
    lowStock: items.filter(i => i.quantity > 0 && i.quantity <= i.minimum_stock).length,
    totalValue: items.reduce((sum, i) => sum + (i.quantity * (i.unit_price || 0)), 0),
  };

  const getStatusBadge = (item) => {
    if (item.quantity <= 0)
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">Out of Stock</span>;
    if (item.quantity <= item.minimum_stock)
      return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-semibold">Low Stock</span>;
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-semibold">In Stock</span>;
  };

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📦 Stock Management</h1>
          <p className="text-gray-500 text-sm mt-1">Inventory tracking & movement ledger</p>
        </div>
        <CanAct module="stock" section="header" element="Add Item button">
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition">
            ➕ Add Item
          </button>
        </CanAct>
      </div>

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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b">
          <CanSee module="stock" section="tabs" element="Inventory tab">
            <button onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-2 px-6 py-4 font-medium text-sm border-b-2 transition ${
                activeTab === 'inventory'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              📋 Inventory
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'inventory' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>{filteredItems.length}</span>
            </button>
          </CanSee>
          <CanSee module="stock" section="tabs" element="Movements LEDGER tab">
            <button onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-2 px-6 py-4 font-medium text-sm border-b-2 transition ${
                activeTab === 'ledger'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              📒 Movements LEDGER
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'ledger' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>{movements.length}</span>
            </button>
          </CanSee>
        </div>

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

        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">📦</div>
            <p>Loading inventory...</p>
          </div>
        ) : (
          <>
            {activeTab === 'inventory' && (
              <div className="overflow-x-auto">
                {filteredItems.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <div className="text-4xl mb-3">🔍</div>
                    <p>No items found matching your filters.</p>
                  </div>
                ) : (
                  <CanSee module="stock" section="inventory" element="Item rows">
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
                                <CanAct module="stock" section="inventory" element="IN button">
                                  <button
                                    onClick={() => setMovementModal({ item, type: 'IN' })}
                                    className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 transition"
                                    title="Stock IN">
                                    📥 IN
                                  </button>
                                </CanAct>
                                <CanAct module="stock" section="inventory" element="OUT button">
                                  <button
                                    onClick={() => setMovementModal({ item, type: 'OUT' })}
                                    className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition"
                                    title="Stock OUT">
                                    📤 OUT
                                  </button>
                                </CanAct>
                                <CanAct module="stock" section="inventory" element="History button">
                                  <button
                                    onClick={() => setHistoryModal(item)}
                                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200 transition"
                                    title="History">
                                    📋
                                  </button>
                                </CanAct>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CanSee>
                )}
              </div>
            )}

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
                            {m.item_name || '—'}
                            <div className="text-xs text-gray-400">{m.item_unit}</div>
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