import React, { useEffect, useState } from 'react';
import App from './App';
import { authService, UserSession } from './services/authService';
import { SupervisorDashboard } from './pages/SupervisorDashboard';
import { PrincipalWorkflowDock, StudentSchoolDock } from './components/SchoolWorkflowDocks';

const RootApp: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(() => authService.getSession());
  useEffect(() => authService.subscribe(() => setSession(authService.getSession())), []);
  const role = String(session?.role || '');
  return <>
    <App />
    {session && role === 'supervisor' && <SupervisorDashboard session={session} />}
    {session && role === 'principal' && <PrincipalWorkflowDock session={session} />}
    {session && role === 'student' && <StudentSchoolDock session={session} />}
  </>;
};

export default RootApp;
