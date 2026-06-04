// src/components/PermissionsTab.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

const ALL_ROLES = ['owner', 'director', 'manager', 'accountant', 'teacher', 'parent', 'secretary'];

export default function PermissionsTab() {
  const { profile } = useAuthStore();
  const [elements, setElements] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [selectedRole, setSelectedRole] = useState('accountant');
  const [loading, setLoading] = useState(true);
  const [moduleAccess, setModuleAccess] = useState({});
  const [modules, setModules] = useState([]);

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [selectedRole, profile]);

  const loadData = async () => {
    setLoading(true);
    // Charger les éléments de permission
    const { data: elems } = await supabase
      .from('permission_elements')
      .select('*')
      .order('module')
      .order('section')
      .order('element');
    setElements(elems || []);

    // Charger les permissions pour le rôle sélectionné
    const { data: perms } = await supabase
      .from('role_permissions')
      .select('permission_element_id, enabled')
      .eq('role', selectedRole);
    const permsMap = {};
    (perms || []).forEach(p => { permsMap[p.permission_element_id] = p.enabled; });
    setPermissions(permsMap);

    // Charger l'accès aux modules
    const { data: allModules } = await supabase
      .from('module_access')
      .select('module')
      .order('module');
    const uniqueModules = [...new Set((allModules || []).map(m => m.module))];
    setModules(uniqueModules);

    const { data: access } = await supabase
      .from('module_access')
      .select('module, can_read')
      .eq('role', selectedRole);
    const accessMap = {};
    (access || []).forEach(a => { accessMap[a.module] = a.can_read; });
    setModuleAccess(accessMap);

    setLoading(false);
  };

  const togglePermission = async (elementId, enabled) => {
    await supabase
      .from('role_permissions')
      .upsert({ role: selectedRole, permission_element_id: elementId, enabled }, { onConflict: 'role, permission_element_id' });
    setPermissions(prev => ({ ...prev, [elementId]: enabled }));
  };

  const toggleAll = (module, enabled) => {
    const moduleElements = elements.filter(e => e.module === module);
    moduleElements.forEach(e => {
      togglePermission(e.id, enabled);
    });
  };

  const toggleModuleAccess = async (moduleName, enabled) => {
    await supabase
      .from('module_access')
      .upsert({ role: selectedRole, module: moduleName, can_read: enabled }, { onConflict: 'role, module' });
    setModuleAccess(prev => ({ ...prev, [moduleName]: enabled }));
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

      {/* --- Section Accès aux modules --- */}
      <div className="bg-white rounded-xl shadow p-6 max-w-2xl">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Module Access (Menu)</h3>
        <p className="text-sm text-gray-500 mb-4">Enable or disable entire modules for this role.</p>
        <div className="space-y-2">
          {modules.map(module => (
            <div key={module} className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700 capitalize">{module}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={moduleAccess[module] || false}
                  onChange={e => toggleModuleAccess(module, e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Sections des permissions fines par module */}
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