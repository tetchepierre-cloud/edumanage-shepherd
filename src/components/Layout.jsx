import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import {
  LayoutDashboard, Users, CreditCard, Receipt,
  Package, ClipboardList, Settings, LogOut,
  Menu, X, GraduationCap, DollarSign, FileText, Calendar, ClipboardCheck, ThumbsUp, PenTool, Award   // ← Award ajouté
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true, group: null },
  // ----- Academic -----
  { to: '/students', icon: Users, label: 'Students', group: 'Academic' },
  { to: '/class-list', icon: FileText, label: 'Class List', group: 'Academic' },
  { to: '/timetable', icon: Calendar, label: 'Timetable', group: 'Academic' },
  { to: '/attendance', icon: ClipboardCheck, label: 'Attendance', group: 'Academic' },
  { to: '/behavior', icon: ThumbsUp, label: 'Behavior', group: 'Academic' },
  { to: '/grades', icon: PenTool, label: 'Grade Entry', group: 'Academic' },
  { to: '/report-cards', icon: Award, label: 'Report Cards', group: 'Academic' },   // ← ajouté
  // ----- Finance & Accounting -----
  { to: '/fees', icon: CreditCard, label: 'School Fees', group: 'Finance' },
  { to: '/expenses', icon: Receipt, label: 'Expenses', group: 'Finance' },
  { to: '/payroll', icon: DollarSign, label: 'Payroll', group: 'Finance' },
  { to: '/stock', icon: Package, label: 'Stock', group: 'Finance' },
  // ----- Administration -----
  { to: '/audit', icon: ClipboardList, label: 'Audit', group: 'Admin' },
  { to: '/settings', icon: Settings, label: 'Settings', group: 'Admin' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { profile, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  let lastGroup = null;

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
          {navItems.map(({ to, icon: Icon, label, exact, group }) => {
            const showGroupLabel = group && group !== lastGroup;
            lastGroup = group;
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
                    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                    }`
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
              <p className="text-sm font-medium">{profile.full_name}</p>
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

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}