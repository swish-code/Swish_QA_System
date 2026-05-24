import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import EvaluationForm from './pages/EvaluationForm';
import AuditList from './pages/AuditList';
import TeamPerformance from './pages/TeamPerformance';
import CoachingManagement from './pages/CoachingManagement';
import EscalationManagement from './pages/EscalationManagement';
import FormSettings from './pages/FormSettings';
import LOBDashboard from './pages/LOBDashboard';
import DropPoint from './pages/DropPoint';
import Notifications from './pages/Notifications';
import ActivityAudit from './pages/ActivityAudit';
import Analysis from './pages/Analysis';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center text-zinc-900 dark:text-white italic font-light tracking-[0.2em] uppercase text-xs transition-colors duration-500">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  
  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
          <Route path="/audits" element={<ProtectedRoute><AuditList /></ProtectedRoute>} />
          <Route path="/evaluate" element={<ProtectedRoute><EvaluationForm /></ProtectedRoute>} />
          <Route path="/evaluate/:id" element={<ProtectedRoute><EvaluationForm /></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute><TeamPerformance /></ProtectedRoute>} />
          <Route path="/lob-performance" element={<ProtectedRoute><LOBDashboard /></ProtectedRoute>} />
          <Route path="/drop-point" element={<ProtectedRoute><DropPoint /></ProtectedRoute>} />
          <Route path="/coaching" element={<ProtectedRoute><CoachingManagement /></ProtectedRoute>} />
          <Route path="/escalations" element={<ProtectedRoute><EscalationManagement /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/activity-audit" element={<ProtectedRoute><ActivityAudit /></ProtectedRoute>} />
          <Route path="/analysis" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
          <Route path="/settings/form" element={<ProtectedRoute><FormSettings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}
