// src/pages/AuditPage.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Shield } from 'lucide-react'
import { CanSee } from '../components/PermissionGate'

export default function AuditPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchLogs() }, [])

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setLogs(data || [])
    setLoading(false)
  }

  const actionColor = (action) => {
    const colors = {
      INSERT: 'bg-green-100 text-green-700',
      UPDATE: 'bg-blue-100 text-blue-700',
      DELETE: 'bg-red-100 text-red-700',
    }
    return colors[action] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield size={24} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-center text-gray-500 py-8">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No audit logs found</p>
        ) : (
          <CanSee module="audit" section="table" element="Audit logs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Date / Time</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">User</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Action</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Table</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2 text-gray-500 text-xs">
                      {new Date(log.created_at).toLocaleString('en-GH')}
                    </td>
                    <td className="py-3 px-2">{log.profiles?.full_name || 'System'}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-2 font-mono text-xs">{log.table_name}</td>
                    <td className="py-3 px-2 text-xs text-gray-500 max-w-xs truncate">
                      {log.description || JSON.stringify(log.new_data).slice(0, 50)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CanSee>
        )}
      </div>
    </div>
  )
}