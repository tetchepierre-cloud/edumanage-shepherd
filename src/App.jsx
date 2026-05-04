import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'

import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StudentsPage from './pages/StudentsPage'
import FeesPage from './pages/FeesPage'
import ExpensesPage from './pages/ExpensesPage'
import PayrollPage from './pages/PayrollPage'
import StockPage from './pages/StockPage'
import AuditPage from './pages/AuditPage'
import SettingsPage from './pages/SettingsPage'
import ClassListPage from './pages/ClassListPage'
import TimetablePage from './pages/TimetablePage'
import ParentPortalPage from './pages/ParentPortalPage'
import AttendancePage from './pages/AttendancePage'
import BehaviorPage from './pages/BehaviorPage'
import GradeEntryPage from './pages/GradeEntryPage'
import ReportCardPage from './pages/ReportCardPage'   // ← ajouté
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>
  return user ? children : <Navigate to="/login" />
}

export default function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [])

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/parent" element={<ParentPortalPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="fees" element={<FeesPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="class-list" element={<ClassListPage />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="behavior" element={<BehaviorPage />} />
          <Route path="grades" element={<GradeEntryPage />} />
          <Route path="report-cards" element={<ReportCardPage />} />   {/* ← ajouté */}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}