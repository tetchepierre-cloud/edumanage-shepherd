// src/components/Layout.jsx
import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { usePermissionsStore } from '../stores/permissionsStore'
import {
  LayoutDashboard, Users, CreditCard, Receipt,
  Package, ClipboardList, Settings, LogOut,
  Menu, X, GraduationCap, DollarSign, FileText,
  Calendar, ClipboardCheck, ThumbsUp, PenTool,
  Award, Baby, FlaskConical, BarChart3, School,
  FileSpreadsheet
} from 'lucide-react'

const allNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true, group: null, module: 'dashboard' },
  // Academic
  { to: '/students',       icon: Users,            label: 'Students',         group: 'Academic', module: 'students' },
  { to: '/class-list',     icon: FileText,         label: 'Class List',       group: 'Academic', module: 'class-list' },
  { to: '/timetable',      icon: Calendar,         label: 'Timetable',        group: 'Academic', module: 'timetable' },
  { to: '/attendance',     icon: ClipboardCheck,   label: 'Attendance',       group: 'Academic', module: 'attendance' },
  { to: '/behavior',       icon: ThumbsUp,         label: 'Behavior',         group: 'Academic', module: 'behavior' },
  { to: '/grades',         icon: PenTool,          label: 'Grade Entry',      group: 'Academic', module: 'grades' },
  { to: '/report-cards',   icon: Award,            label: 'Terminal Reports', group: 'Academic', module: 'report-cards' },
  { to: '/kg-assessments', icon: Baby,             label: 'KG Assessments',   group: 'Academic', module: 'kg-assessments' },
  { to: '/mock-exams',     icon: FlaskConical,     label: 'Mock Exams',       group: 'Academic', module: 'mock-exams' },
  { to: '/bece-tracker',   icon: BarChart3,        label: 'BECE Tracker',     group: 'Academic', module: 'bece-tracker' },
  { to: '/promotion',      icon: School,           label: 'Promotion',        group: 'Academic', module: 'promotion' },
  // Finance
  { to: '/fees',     icon: CreditCard,  label: 'School Fees', group: 'Finance', module: 'fees' },
  { to: '/expenses', icon: Receipt,     label: 'Expenses',    group: 'Finance', module: 'expenses' },
  { to: '/payroll',  icon: DollarSign,  label: 'Payroll',     group: 'Finance', module: 'payroll' },
  { to: '/stock',    icon: Package,     label: 'Stock',       group: 'Finance', module: 'stock' },
  // Administration
  { to: '/audit',      icon: ClipboardList,    label: 'Audit',      group: 'Admin', module: 'audit' },
  { to: '/settings',   icon: Settings,         label: 'Settings',   group: 'Admin', module: 'settings' },
  { to: '/ges-report', icon: FileSpreadsheet,  label: 'GES Report', group: 'Admin', module: 'ges-report' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { profile, logout } = useAuthStore()
  const navigate = useNavigate()
  const [permissions, setPermissions] = useState({})
  const { permissions: granularPermissions, loadPermissions } = usePermissionsStore()

  // Charger les permissions du menu (module_access) – prioritaire
  useEffect(() => {
    if (!profile?.role) return
    supabase
      .from('module_access')
      .select('module, can_read')
      .eq('role', profile.role)
      .then(({ data }) => {
        const perms = {}
        ;(data || []).forEach(p => { perms[p.module] = p.can_read })
        setPermissions(perms)
      })
      .catch(() => {
        const all = {}
        allNavItems.forEach(item => { if (item.module) all[item.module] = true })
        setPermissions(all)
      })
  }, [profile?.role])

  // Charger les permissions granulaires pour le rôle connecté
  useEffect(() => {
    if (profile?.role) loadPermissions(profile.role)
    else loadPermissions(null)
  }, [profile?.role])

  const hasAnyGranularPermission = (module) => {
    if (!module || !granularPermissions) return false
    return Object.keys(granularPermissions).some(key => key.startsWith(module + '.'))
  }

  const isFullAccess = ['owner', 'director'].includes(profile?.role)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  let lastGroup = null

  const navItems = allNavItems.filter(item => {
    if (item.module === 'dashboard') return true
    if (isFullAccess) return true
    return true
  })

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-blue-900 text-white transition-all duration-300 flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b border-blue-800">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <GraduationCap size={24} />
              <span className="font-bold text-sm">EduManage GH</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white hover:text-blue-200">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, exact, group, module }) => {
            const showGroupLabel = group && group !== lastGroup;
            lastGroup = group;

            const moduleAccess = permissions[module];
            const blockedByModuleAccess = moduleAccess === false;
            const noGranularPermission = !isFullAccess && !hasAnyGranularPermission(module);
            const isDisabled = module && module !== 'dashboard' &&
              (blockedByModuleAccess || (!moduleAccess && noGranularPermission));

            if (module === 'dashboard' || !module) {
              return (
                <React.Fragment key={to}>
                  {showGroupLabel && sidebarOpen && (
                    <div className="pt-3 pb-1 px-3 text-xs font-semibold text-blue-300 uppercase tracking-wider">
                      {group}
                    </div>
                  )}
                  <NavLink
                    to={to}
                    end={exact}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`
                    }
                  >
                    <Icon size={20} />
                    {sidebarOpen && <span className="text-sm">{label}</span>}
                  </NavLink>
                </React.Fragment>
              )
            }

            if (isDisabled) {
              return (
                <React.Fragment key={to}>
                  {showGroupLabel && sidebarOpen && (
                    <div className="pt-3 pb-1 px-3 text-xs font-semibold text-blue-300 uppercase tracking-wider">
                      {group}
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-blue-400/40 cursor-not-allowed select-none"
                    title="No permissions granted for this module">
                    <Icon size={20} />
                    {sidebarOpen && <span className="text-sm">{label}</span>}
                  </div>
                </React.Fragment>
              )
            }

            return (
              <React.Fragment key={to}>
                {showGroupLabel && sidebarOpen && (
                  <div className="pt-3 pb-1 px-3 text-xs font-semibold text-blue-300 uppercase tracking-wider">
                    {group}
                  </div>
                )}
                <NavLink
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`
                  }
                >
                  <Icon size={20} />
                  {sidebarOpen && <span className="text-sm">{label}</span>}
                </NavLink>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="p-4 border-t border-blue-800">
          {sidebarOpen && profile && (
            <div className="mb-3">
              <p className="text-sm font-medium">{profile.full_name || `${profile.first_name} ${profile.last_name}`}</p>
              <p className="text-xs text-blue-300">{profile.role}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors"
          >
            <LogOut size={20} />
            {sidebarOpen && <span className="text-sm">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main content – la clé force le remontage après un refresh de session */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}