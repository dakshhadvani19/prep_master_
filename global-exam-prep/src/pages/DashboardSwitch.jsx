/**
 * /dashboard shows the student Dashboard for students and the Admin Dashboard
 * for admin / superAdmin. Same route, two components — student Dashboard.jsx
 * is not overwritten.
 */
import { useAuth } from '../context/AuthContext';
import Dashboard from './Dashboard';
import AdminDashboard from './AdminDashboard';

export default function DashboardSwitch() {
    const { isAdmin } = useAuth();
    return isAdmin ? <AdminDashboard /> : <Dashboard />;
}
