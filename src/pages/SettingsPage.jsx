// src/pages/SettingsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Settings, Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [profile, setProfile]     = useState(null)
  const [classes, setClasses]     = useState([])
  const [staff, setStaff]         = useState([])
  const [activeTab, setActiveTab] = useState('classes')
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [newClass, setNewClass] = useState({
    name: '', level: 'KG', capacity: 30
  })
  const [newStaff, setNewStaff] = useState({
    first_name: '', last_name: '', position: 'Teacher',
    phone: '', email: '', base_salary: ''
  })

  // ── Load current user profile ──
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingProfile(false); return }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(data)
      setLoadingProfile(false)
    }
    loadProfile()
  }, [])

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [classesRes, staffRes] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      supabase.from('staff').select('*').eq('active', true).order('last_name')
    ])
    setClasses(classesRes.data || [])
    setStaff(staffRes.data || [])
  }

  const handleAddClass = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('classes').insert([newClass])
    if (error) {
      toast.error('Error: ' + error.message)
      return
    }
    toast.success('Class added successfully!')
    setNewClass({ name: '', level: 'KG', capacity: 30 })
    fetchData()
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('staff').insert([{
      ...newStaff,
      base_salary: parseFloat(newStaff.base_salary) || 0,
      active: true
    }])
    if (error) {
      toast.error('Error: ' + error.message)
      return
    }
    toast.success('Staff member added successfully!')
    setNewStaff({
      first_name: '', last_name: '', position: 'Teacher',
      phone: '', email: '', base_salary: ''
    })
    fetchData()
  }

  // ── Loading state ──
  if (loadingProfile) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    )
  }

  // ── Access control ──
  const isAdmin = ['owner', 'director', 'manager'].includes(profile?.role)

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <Settings size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            Access restricted to administrators
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Current role: <strong>{profile?.role || 'unknown'}</strong>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">
            Logged in as <strong className="capitalize">{profile?.role}</strong>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'classes', label: '🏫 Classes' },
          { id: 'staff',   label: '👥 Staff'   },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Classes ── */}
      {activeTab === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Add Class Form */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Add New Class</h2>
            <form onSubmit={handleAddClass} className="space-y-4">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Class Name *
                </label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newClass.name}
                  onChange={e => setNewClass({...newClass, name: e.target.value})}
                  placeholder="e.g. KG 1, Primary 3, JHS 2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Level
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newClass.level}
                  onChange={e => setNewClass({...newClass, level: e.target.value})}
                >
                  <option value="KG">KG (Kindergarten)</option>
                  <option value="Primary">Primary</option>
                  <option value="JHS">JHS (Junior High School)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Capacity
                </label>
                <input
                  type="number" min="1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newClass.capacity}
                  onChange={e => setNewClass({
                    ...newClass, capacity: parseInt(e.target.value)
                  })}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg
                           font-medium hover:bg-blue-700 transition-colors
                           flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add Class
              </button>
            </form>
          </div>

          {/* Classes List */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">
              Existing Classes ({classes.length})
            </h2>
            {classes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">No classes registered yet</p>
                <p className="text-gray-300 text-sm mt-1">
                  Add your first class using the form
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {classes.map(c => (
                  <div
                    key={c.id}
                    className="flex justify-between items-center p-3
                               bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        Capacity: {c.capacity} students
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium
                      ${c.level === 'KG'      ? 'bg-purple-100 text-purple-700' :
                        c.level === 'Primary' ? 'bg-blue-100   text-blue-700'   :
                                                'bg-green-100  text-green-700'  }`}>
                      {c.level}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Staff ── */}
      {activeTab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Add Staff Form */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Add Staff Member</h2>
            <form onSubmit={handleAddStaff} className="space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newStaff.first_name}
                    onChange={e => setNewStaff({
                      ...newStaff, first_name: e.target.value
                    })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newStaff.last_name}
                    onChange={e => setNewStaff({
                      ...newStaff, last_name: e.target.value
                    })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newStaff.position}
                  onChange={e => setNewStaff({
                    ...newStaff, position: e.target.value
                  })}
                >
                  <option value="Teacher">Teacher</option>
                  <option value="Headmaster">Headmaster</option>
                  <option value="Accountant">Accountant</option>
                  <option value="Secretary">Secretary</option>
                  <option value="Security">Security Guard</option>
                  <option value="Janitor">Janitor</option>
                  <option value="Cook">Cook</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newStaff.phone}
                  onChange={e => setNewStaff({...newStaff, phone: e.target.value})}
                  placeholder="e.g. 0244123456"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newStaff.email}
                  onChange={e => setNewStaff({...newStaff, email: e.target.value})}
                  placeholder="staff@school.edu.gh"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Salary (GHS)
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newStaff.base_salary}
                  onChange={e => setNewStaff({
                    ...newStaff, base_salary: e.target.value
                  })}
                  placeholder="0.00"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg
                           font-medium hover:bg-blue-700 transition-colors
                           flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add Staff Member
              </button>
            </form>
          </div>

          {/* Staff List */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">
              Active Staff ({staff.length})
            </h2>
            {staff.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">No staff members registered yet</p>
                <p className="text-gray-300 text-sm mt-1">
                  Add your first staff member using the form
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {staff.map(s => (
                  <div
                    key={s.id}
                    className="flex justify-between items-center p-3
                               bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {s.first_name} {s.last_name}
                      </p>
                      <p className="text-xs text-gray-500">{s.position}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-600">
                        GHS {parseFloat(s.base_salary || 0).toFixed(2)}
                      </p>
                      {s.phone && (
                        <p className="text-xs text-gray-400">{s.phone}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
