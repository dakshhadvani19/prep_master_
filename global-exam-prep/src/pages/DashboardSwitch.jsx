/**
 * /dashboard selects one role-specific bundle.
 * The opposite dashboard is not downloaded until a user with that role opens it.
 */
import { lazy } from 'react';
import { useAuth } from '../context/AuthContext';

const StudentDashboard = lazy(() => import('./Dashboard'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));

export default function DashboardSwitch() {
    const { isAdmin } = useAuth();
    return isAdmin ? <AdminDashboard /> : <StudentDashboard />;
}
