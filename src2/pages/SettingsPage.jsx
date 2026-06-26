// src/pages/SettingsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Settings, Plus, Loader2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import FeeManagementPage from './FeeManagementPage'
import AcademicSettingsTab from '../components/AcademicSettingsTab';
import PermissionsTab from '../components/PermissionsTab';
import { CanSee } from '../components/PermissionGate';
import TeacherAssignmentsTab from '../components/TeacherAssignmentsTab';

export default function SettingsPage() {
  const [profile, setProfile]     = useState(null)
  const [classes, setClasses]     = useState([])
  const [staff, setStaff]         = useState([])
  const [levels, setLevels]       = useState([])
  const [activeTab, setActiveTab] = useState('school')
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [newClass, setNewClass] = useState({ level: '', capacity: 30 })
  const [newStaff, setNewStaff] = useState({
    first_name: '', last_name: '', position: 'Teacher',
    phone: '', email: '', base_salary: ''
  })

  const [schoolSettings, setSchoolSettings] = useState({
    school_name: '',
    address: '',
    phone: '',
    email: '',
    logo: '',
    academic_year: '2025/2026',
  })
  const [savingSchool, setSavingSchool] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingProfile(false); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
      setLoadingProfile(false)
    }
    loadProfile()
  }, [])

  useEffect(() => { fetchData(); loadSchoolSettings() }, [])

  const fetchData = async () => {
    const [classesRes, staffRes, levelsRes] = await Promise.all([
      supabase
        .from('classes')
        .select('*, levels(id, name)')
        .order('name'),
      supabase.from('staff').select('*').eq('active', true).order('last_name'),
      supabase.from('levels').select('*').order('sort_order')
    ])
    setClasses(classesRes.data || [])
    setStaff(staffRes.data || [])
    setLevels(levelsRes.data || [])
  }

  const loadSchoolSettings = async () => {
    const { data } = await supabase.from('app_settings').select('*')
    const config = {}
    data?.forEach(d => { config[d.key] = d.value })
    setSchoolSettings({
      school_name: config.school_name || '',
      address:     config.address     || '',
      phone:       config.phone       || '',
      email:       config.email       || '',
      logo:        config.logo        || '',
      academic_year: config.academic_year || '2025/2026',
    })
  }

  const saveSchoolSettings = async () => {
    setSavingSchool(true)
    const entries = [
      { key: 'school_name', value: schoolSettings.school_name },
      { key: 'address',     value: schoolSettings.address },
      { key: 'phone',       value: schoolSettings.phone },
      { key: 'email',       value: schoolSettings.email },
      { key: 'logo',        value: schoolSettings.logo },
      { key: 'academic_year', value: schoolSettings.academic_year },
    ]
    for (const entry of entries) {
      const { error } = await supabase
        .from('app_settings')
        .upsert(entry, { onConflict: 'key' })
      if (error) {
        toast.error('Failed to save: ' + error.message)
        setSavingSchool(false)
        return
      }
    }
    toast.success('School settings saved!')
    setSavingSchool(false)
  }

  const saveMinPayment = async (levelId, value) => {
    const amount = parseFloat(value) || 0
    const { error } = await supabase
      .from('levels')
      .update({ min_payment: amount })
      .eq('id', levelId)
    if (error) {
      toast.error('Failed to save minimum payment')
    } else {
      toast.success('Minimum payment updated')
      setLevels(prev => prev.map(l => l.id === levelId ? { ...l, min_payment: amount } : l))
    }
  }

  const handleAddClass = async (e) => {
    e.preventDefault()
    const selectedLevel = levels.find(l => l.id === newClass.level)
    if (!selectedLevel) {
      toast.error('Please select a grade.')
      return
    }
    const { count, error: countError } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('level_id', newClass.level)
    if (countError) {
      toast.error('Error: ' + countError.message)
      return
    }
    const existingCount = count || 0
    let className = ''
    if (existingCount === 0) {
      className = selectedLevel.name
    } else {
      if (existingCount === 1) {
        const { data: firstClass, error: firstError } = await supabase
          .from('classes')
          .select('id, name')
          .eq('level_id', newClass.level)
          .order('name')
          .limit(1)
          .single()
        if (!firstError && firstClass && firstClass.name === selectedLevel.name) {
          await supabase
            .from('classes')
            .update({ name: `${selectedLevel.name} A` })
            .eq('id', firstClass.id)
        }
      }
      const suffix = String.fromCharCode(65 + existingCount)
      className = `${selectedLevel.name} ${suffix}`
    }
    const { error } = await supabase.from('classes').insert([{
      name: className,
      level_id: newClass.level,
      capacity: newClass.capacity,
    }])
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success(`Class "${className}" created!`)
    setNewClass({ level: '', capacity: 30 })
    fetchData()
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('staff').insert([{
      ...newStaff, base_salary: parseFloat(newStaff.base_salary) || 0, active: true
    }])
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Staff member added successfully!')
    setNewStaff({ first_name: '', last_name: '', position: 'Teacher', phone: '', email: '', base_salary: '' })
    fetchData()
  }

  if (loadingProfile) {
    return <div className="p-6 flex items-center justify-center min-h-64"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
  }

  const isAdmin = ['owner', 'director', 'manager'].includes(profile?.role)
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <Settings size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Access restricted to administrators</p>
          <p className="text-gray-400 text-sm mt-1">Current role: <strong>{profile?.role || 'unknown'}</strong></p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Logged in as <strong className="capitalize">{profile?.role}</strong></p>
        </div>
      </div>

      {/* Tabs avec permissions */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <CanSee module="settings" section="tabs" element="School tab">
          <button onClick={() => setActiveTab('school')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'school' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            🏫 School
          </button>
        </CanSee>
        <CanSee module="settings" section="tabs" element="Classes tab">
          <button onClick={() => setActiveTab('classes')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'classes' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            🏫 Classes
          </button>
        </CanSee>
        <CanSee module="settings" section="tabs" element="Staff tab">
          <button onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'staff' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            👥 Staff
          </button>
        </CanSee>
        <CanSee module="settings" section="tabs" element="Fee Structure tab">
          <button onClick={() => setActiveTab('feestructure')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'feestructure' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            💲 Fee Structure
          </button>
        </CanSee>
        <CanSee module="settings" section="tabs" element="Fee Schedules tab">
          <button onClick={() => setActiveTab('schedules')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'schedules' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            📅 Fee Schedules
          </button>
        </CanSee>
        <CanSee module="settings" section="tabs" element="Academic tab">
          <button onClick={() => setActiveTab('academic')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'academic' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            🎓 Academic
          </button>
        </CanSee>
        <CanSee module="settings" section="tabs" element="Permissions tab">
          <button onClick={() => setActiveTab('permissions')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'permissions' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            🔐 Permissions
          </button>
        </CanSee>
      </div>
      <CanSee module="settings" section="tabs" element="Teacher Access tab">
          <button onClick={() => setActiveTab('assignments')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${activeTab === 'assignments' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            🔑 Teacher Access
          </button>
        </CanSee>

      {/* ── Tab: School ── */}
      {activeTab === 'school' && (
        <div className="bg-white rounded-xl shadow p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-4">School Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
              <input type="text" value={schoolSettings.school_name} onChange={e => setSchoolSettings(s => ({ ...s, school_name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Bright Future School" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={schoolSettings.address} onChange={e => setSchoolSettings(s => ({ ...s, address: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Tamale, Northern Region" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input type="text" value={schoolSettings.phone} onChange={e => setSchoolSettings(s => ({ ...s, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. +233 20 000 0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" value={schoolSettings.email} onChange={e => setSchoolSettings(s => ({ ...s, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. info@brightfuture.edu.gh" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL (or base64)</label>
              <input type="text" value={schoolSettings.logo} onChange={e => setSchoolSettings(s => ({ ...s, logo: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://... or data:image/png;base64,..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
              <select value={schoolSettings.academic_year} onChange={e => setSchoolSettings(s => ({ ...s, academic_year: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="2024/2025">2024/2025</option>
                <option value="2025/2026">2025/2026</option>
                <option value="2026/2027">2026/2027</option>
              </select>
            </div>
            <button onClick={saveSchoolSettings} disabled={savingSchool} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
              {savingSchool ? 'Saving...' : 'Save School Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Classes ── */}
      {activeTab === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Add New Class</h2>
            <p className="text-xs text-gray-400 mb-4">
              The class name is generated automatically. First class uses the grade name. Subsequent classes receive a suffix (A, B, C…).
            </p>
            <form onSubmit={handleAddClass} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newClass.level} onChange={e => setNewClass({...newClass, level: e.target.value})}>
                  <option value="">-- Select Grade --</option>
                  {levels.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newClass.capacity} 
                  onChange={e => {
                    const raw = e.target.value;
                    setNewClass({...newClass, capacity: raw === '' ? 30 : parseInt(raw, 10)});
                  }}
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                <Plus size={16} /> Add Class
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Existing Classes ({classes.length})</h2>
            {classes.length === 0 ? (
              <div className="text-center py-8"><p className="text-gray-400">No classes registered yet</p></div>
            ) : (
              <div className="space-y-2">
                {classes.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">Capacity: {c.capacity} students</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-700">
                      {c.levels?.name || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">🔒 Minimum Admission Payment (per Level)</h2>
            <p className="text-sm text-gray-500 mb-4">
              Define the minimum total payment a student must have before being marked as <strong>Active</strong> and allowed in class lists.
            </p>
            {levels.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No levels configured yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-gray-600">Level</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-600">Minimum Payment (GHS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {levels.map(level => (
                      <tr key={level.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{level.name}</td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={level.min_payment || 0}
                            onBlur={e => saveMinPayment(level.id, e.target.value)}
                            className="w-32 text-right border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Staff ── */}
      {activeTab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Add Staff Member</h2>
            <form onSubmit={handleAddStaff} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newStaff.first_name} onChange={e => setNewStaff({...newStaff, first_name: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newStaff.last_name} onChange={e => setNewStaff({...newStaff, last_name: e.target.value})} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newStaff.position} onChange={e => setNewStaff({...newStaff, position: e.target.value})}>
                  <option>Teacher</option><option>Headmaster</option><option>Accountant</option><option>Secretary</option><option>Security</option><option>Janitor</option><option>Cook</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newStaff.phone} onChange={e => setNewStaff({...newStaff, phone: e.target.value})} placeholder="0244123456" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Salary (GHS)</label>
                <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newStaff.base_salary} onChange={e => setNewStaff({...newStaff, base_salary: e.target.value})} placeholder="0.00" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                <Plus size={16} /> Add Staff Member
              </button>
            </form>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Active Staff ({staff.length})</h2>
            {staff.length === 0 ? (
              <div className="text-center py-8"><p className="text-gray-400">No staff members registered yet</p></div>
            ) : (
              <div className="space-y-2">
                {staff.map(s => (
                  <div key={s.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <p className="font-medium text-gray-900">{s.first_name} {s.last_name}</p>
                      <p className="text-xs text-gray-500">{s.position}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-600">GHS {parseFloat(s.base_salary || 0).toFixed(2)}</p>
                      {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Fee Structure ── */}
      {activeTab === 'feestructure' && <FeeManagementPage />}

      {/* ── Tab: Fee Schedules ── */}
      {activeTab === 'schedules' && <FeeSchedulesTab />}

      {activeTab === 'academic' && <AcademicSettingsTab />}
      {activeTab === 'permissions' && <PermissionsTab />}

      {activeTab === 'assignments' && <TeacherAssignmentsTab />}

    </div>
  )
}

// ══════════════════════════════════════════════════════════
// FEE SCHEDULES TAB (complet, inchangé sauf qu'on n'ajoute pas de permissions ici)
// ══════════════════════════════════════════════════════════
function FeeSchedulesTab() {
  const [levels, setLevels]           = useState([])
  const [selectedYear, setSelectedYear] = useState('2025/2026')
  const [selectedLevel, setSelectedLevel] = useState('')
  const [feeStructures, setFeeStructures] = useState([])
  const [schedules, setSchedules]     = useState({})
  const [expanded, setExpanded]       = useState({})
  const [newTranche, setNewTranche]   = useState({})
  const [loading, setLoading]         = useState(false)
  const [saving, setSaving]           = useState(false)

  const YEARS = ['2024/2025', '2025/2026', '2026/2027']

  useEffect(() => { fetchLevels() }, [])
  useEffect(() => { if (selectedLevel) fetchFeeStructures() }, [selectedLevel, selectedYear])

  const fetchLevels = async () => {
    const { data } = await supabase.from('levels').select('id, name').eq('is_active', true).order('sort_order')
    setLevels(data || [])
    if (data?.length) setSelectedLevel(data[0].id)
  }

  const fetchFeeStructures = async () => {
    setLoading(true)
    const { data: fees } = await supabase
      .from('fee_structure')
      .select('*')
      .eq('level_id', selectedLevel)
      .eq('academic_year', selectedYear)
      .eq('is_active', true)
      .order('fee_name')
    setFeeStructures(fees || [])
    if (fees?.length) {
      const ids = fees.map(f => f.id)
      const { data: scheds } = await supabase
        .from('fee_schedules')
        .select('*')
        .in('fee_structure_id', ids)
        .order('sort_order')
      const grouped = {}
      ids.forEach(id => { grouped[id] = [] })
      ;(scheds || []).forEach(s => {
        if (grouped[s.fee_structure_id]) grouped[s.fee_structure_id].push(s)
      })
      setSchedules(grouped)
      const initTranches = {}
      ids.forEach(id => { initTranches[id] = { label: '', due_date: '', amount: '' } })
      setNewTranche(initTranches)
    }
    setLoading(false)
  }

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const handleAddTranche = async (feeStructureId, annualAmount) => {
    const t = newTranche[feeStructureId]
    if (!t?.label || !t?.due_date || !t?.amount) {
      toast.error('Please fill all fields — label, date and amount')
      return
    }
    const existingTotal = (schedules[feeStructureId] || []).reduce((s, tr) => s + parseFloat(tr.amount || 0), 0)
    const newAmount     = parseFloat(t.amount)
    if (existingTotal + newAmount > annualAmount) {
      toast.error(`Total tranches (GHS ${(existingTotal + newAmount).toFixed(2)}) exceeds annual amount (GHS ${annualAmount.toFixed(2)})`)
      return
    }
    setSaving(true)
    const sortOrder = (schedules[feeStructureId] || []).length + 1
    const { error } = await supabase.from('fee_schedules').insert({
      fee_structure_id: feeStructureId,
      label:      t.label,
      due_date:   t.due_date,
      amount:     newAmount,
      sort_order: sortOrder,
    })
    if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
    toast.success('Tranche added!')
    setNewTranche(prev => ({ ...prev, [feeStructureId]: { label: '', due_date: '', amount: '' } }))
    fetchFeeStructures()
    setSaving(false)
  }

  const handleDeleteTranche = async (trancheId, feeStructureId) => {
    if (!window.confirm('Delete this tranche?')) return
    const { error } = await supabase.from('fee_schedules').delete().eq('id', trancheId)
    if (error) { toast.error('Error: ' + error.message); return }
    toast.success('Tranche deleted')
    fetchFeeStructures()
  }

  const levelName = levels.find(l => l.id === selectedLevel)?.name || ''

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">📅 Payment Schedule (Échéancier)</p>
        <p>For each fee type, define the exact tranches the school expects parents to pay and when. The total of all tranches must equal the annual fee amount. This schedule is used to calculate "Fees Expected" in all reports.</p>
      </div>

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-36"
            value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)}>
            {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {levelName && selectedYear && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 font-medium">
            Viewing: {levelName} · {selectedYear}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={28} /></div>
      ) : feeStructures.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <p className="text-gray-400 font-medium">No fees configured for {levelName} · {selectedYear}</p>
          <p className="text-gray-300 text-sm mt-1">Go to Fee Structure to add fees first</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feeStructures.map(fee => {
            const tranches      = schedules[fee.id] || []
            const totalTranches = tranches.reduce((s, t) => s + parseFloat(t.amount || 0), 0)
            const annualAmount  = parseFloat(fee.amount || 0)
            const remaining     = annualAmount - totalTranches
            const isComplete    = Math.abs(remaining) < 0.01
            const isOpen        = expanded[fee.id]
            const nt            = newTranche[fee.id] || { label: '', due_date: '', amount: '' }

            return (
              <div key={fee.id} className="bg-white rounded-xl shadow overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(fee.id)}>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{fee.fee_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{fee.fee_type} · Annual: GHS {annualAmount.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(100, (totalTranches / annualAmount) * 100)}%` }} />
                        </div>
                        <span className={`text-xs font-medium ${isComplete ? 'text-green-600' : 'text-blue-600'}`}>
                          {tranches.length} tranche{tranches.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isComplete ? 'text-green-600' : 'text-amber-600'}`}>
                        {isComplete ? '✓ Complete' : `GHS ${remaining.toFixed(2)} remaining`}
                      </p>
                    </div>
                    {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {tranches.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Label</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Due Date</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {tranches.map((t) => (
                            <tr key={t.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{t.label}</td>
                              <td className="px-3 py-2 text-gray-600">
                                {new Date(t.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-blue-700">GHS {parseFloat(t.amount).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => handleDeleteTranche(t.id, fee.id)}
                                  className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className={`${isComplete ? 'bg-green-50' : 'bg-amber-50'}`}>
                            <td colSpan={2} className={`px-3 py-2 text-xs font-bold ${isComplete ? 'text-green-700' : 'text-amber-700'}`}>
                              {isComplete ? '✓ TOTAL = Annual amount' : `TOTAL · GHS ${remaining.toFixed(2)} remaining to allocate`}
                            </td>
                            <td className={`px-3 py-2 text-right font-bold ${isComplete ? 'text-green-700' : 'text-amber-700'}`}>
                              GHS {totalTranches.toFixed(2)}
                            </td>
                            <td />
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">No tranches yet — add the first one below</p>
                    )}

                    {!isComplete && (
                      <div className="border border-dashed border-blue-300 rounded-lg p-3 bg-blue-50">
                        <p className="text-xs font-semibold text-blue-700 mb-2">+ Add a tranche</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Label *</label>
                            <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="e.g. September" value={nt.label}
                              onChange={e => setNewTranche(prev => ({ ...prev, [fee.id]: { ...nt, label: e.target.value } }))} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Due Date *</label>
                            <input type="date" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={nt.due_date}
                              onChange={e => setNewTranche(prev => ({ ...prev, [fee.id]: { ...nt, due_date: e.target.value } }))} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Amount (GHS) * <span className="text-blue-600">max: {remaining.toFixed(2)}</span></label>
                            <input type="number" step="0.01" min="0" max={remaining}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="0.00" value={nt.amount}
                              onChange={e => setNewTranche(prev => ({ ...prev, [fee.id]: { ...nt, amount: e.target.value } }))} />
                          </div>
                        </div>
                        <button onClick={() => handleAddTranche(fee.id, annualAmount)} disabled={saving}
                          className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                          <Plus size={14} /> Add Tranche
                        </button>
                      </div>
                    )}

                    {isComplete && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-medium text-center">
                        ✓ Schedule complete — all GHS {annualAmount.toFixed(2)} allocated across {tranches.length} tranches
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}