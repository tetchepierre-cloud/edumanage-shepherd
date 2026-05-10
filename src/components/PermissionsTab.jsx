// src/components/PermissionsTab.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

const ALL_ROLES = ['owner', 'director', 'manager', 'accountant', 'teacher', 'parent'];

export default function PermissionsTab() {
  const { profile } = useAuthStore();
  const [elements, setElements] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [selectedRole, setSelectedRole] = useState('accountant');
  const [loading, setLoading] = useState(true);

  // Charger les éléments et les permissions existantes pour le rôle sélectionné
  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [selectedRole, profile]);

  const loadData = async () => {
    setLoading(true);
    // Récupérer tous les éléments
    const { data: elems } = await supabase
      .from('permission_elements')
      .select('*')
      .order('module')
      .order('section')
      .order('element');

    setElements(elems || []);

    // Récupérer les permissions pour le rôle sélectionné
    const { data: perms } = await supabase
      .from('role_permissions')
      .select('permission_element_id, enabled')
      .eq('role', selectedRole);

    const permsMap = {};
    (perms || []).forEach(p => { permsMap[p.permission_element_id] = p.enabled; });
    setPermissions(permsMap);

    setLoading(false);
  };

  const togglePermission = async (elementId, enabled) => {
    // Upsert dans role_permissions
    const { error } = await supabase
      .from('role_permissions')
      .upsert({ role: selectedRole, permission_element_id: elementId, enabled }, { onConflict: 'role, permission_element_id' });

    if (error) {
      toast.error('Failed to update permission');
    } else {
      setPermissions(prev => ({ ...prev, [elementId]: enabled }));
    }
  };

  const toggleAll = (module, enabled) => {
    const moduleElements = elements.filter(e => e.module === module);
    moduleElements.forEach(e => {
      togglePermission(e.id, enabled);
    });
  };

  // Grouper par module pour l'affichage
  const grouped = elements.reduce((acc, e) => {
    if (!acc[e.module]) acc[e.module] = [];
    acc[e.module].push(e);
    return acc;
  }, {});

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading permissions...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Sélecteur de rôle */}
      <div className="bg-white rounded-xl shadow p-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Manage Permissions</h2>
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Role:</label>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Liste des permissions par module */}
      {Object.keys(grouped).map(module => (
        <div key={module} className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 capitalize">{module}</h3>
            <div className="flex gap-2">
              <button
                onClick={() => toggleAll(module, true)}
                className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
              >
                Enable All
              </button>
              <button
                onClick={() => toggleAll(module, false)}
                className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
              >
                Disable All
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2">Section</th>
                  <th className="text-left px-3 py-2">Element</th>
                  <th className="text-center px-3 py-2">Type</th>
                  <th className="text-center px-3 py-2">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {grouped[module].map(elem => (
                  <tr key={elem.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 capitalize">{elem.section}</td>
                    <td className="px-3 py-2">{elem.label}</td>
                    <td className="px-3 py-2 text-center text-xs uppercase">{elem.action_type}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={permissions[elem.id] || false}
                        onChange={e => togglePermission(elem.id, e.target.checked)}
                        className="h-4 w-4 text-blue-600 rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}