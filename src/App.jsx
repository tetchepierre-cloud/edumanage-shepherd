// src/App.jsx
import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'
import ProtectedRoute from './components/ProtectedRoute'   // ← ajouté

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
import ReportCardPage from './pages/ReportCardPage'
import KgAssessmentPage from './pages/KgAssessmentPage'
import MockExamsPage from './pages/MockExamsPage'
import BeceTrackerPage from './pages/BeceTrackerPage'
import PromotionPage from './pages/PromotionPage'
import GesReportPage from './pages/GesReportPage'
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
          <Route path="students" element={<ProtectedRoute moduleName="students"><StudentsPage /></ProtectedRoute>} />
          <Route path="fees" element={<ProtectedRoute moduleName="fees"><FeesPage /></ProtectedRoute>} />
          <Route path="expenses" element={<ProtectedRoute moduleName="expenses"><ExpensesPage /></ProtectedRoute>} />
          <Route path="payroll" element={<ProtectedRoute moduleName="payroll"><PayrollPage /></ProtectedRoute>} />
          <Route path="stock" element={<ProtectedRoute moduleName="stock"><StockPage /></ProtectedRoute>} />
          <Route path="audit" element={<ProtectedRoute moduleName="audit"><AuditPage /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute moduleName="settings"><SettingsPage /></ProtectedRoute>} />
          <Route path="class-list" element={<ProtectedRoute moduleName="class-list"><ClassListPage /></ProtectedRoute>} />
          <Route path="timetable" element={<ProtectedRoute moduleName="timetable"><TimetablePage /></ProtectedRoute>} />
          <Route path="attendance" element={<ProtectedRoute moduleName="attendance"><AttendancePage /></ProtectedRoute>} />
          <Route path="behavior" element={<ProtectedRoute moduleName="behavior"><BehaviorPage /></ProtectedRoute>} />
          <Route path="grades" element={<ProtectedRoute moduleName="grades"><GradeEntryPage /></ProtectedRoute>} />
          <Route path="report-cards" element={<ProtectedRoute moduleName="report-cards"><ReportCardPage /></ProtectedRoute>} />
          <Route path="kg-assessments" element={<ProtectedRoute moduleName="kg-assessments"><KgAssessmentPage /></ProtectedRoute>} />
          <Route path="mock-exams" element={<ProtectedRoute moduleName="mock-exams"><MockExamsPage /></ProtectedRoute>} />
          <Route path="bece-tracker" element={<ProtectedRoute moduleName="bece-tracker"><BeceTrackerPage /></ProtectedRoute>} />
          <Route path="promotion" element={<ProtectedRoute moduleName="promotion"><PromotionPage /></ProtectedRoute>} />
          <Route path="ges-report" element={<ProtectedRoute moduleName="ges-report"><GesReportPage /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}