// src/pages/StockPage.jsx
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
// ADD ITEM MODAL
// ============================================================
const AddItemModal = ({ onClose, onSuccess, showToast, existingItems }) => {
  // ... (inchangé)
};

// ============================================================
// MOVEMENT MODAL (IN / OUT)
// ============================================================
const MovementModal = ({ item, movementType, onClose, onSuccess, showToast }) => {
  // ... (inchangé)
};

// ============================================================
// HISTORY MODAL
// ============================================================
const HistoryModal = ({ item, onClose }) => {
  // ... (inchangé)
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

  // ── Client-side Filtering ─────────────
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
        <CanAct module="stock" section="header" element="Add Item button">
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition">
            ➕ Add Item
          </button>
        </CanAct>
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