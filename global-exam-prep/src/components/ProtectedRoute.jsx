/**
 * ProtectedRoute.jsx
 *
 * Wraps routes that require authentication (and optionally a specific role).
 *
 * Usage:
 *   <ProtectedRoute>                          – any signed-in student
 *   <ProtectedRoute requiredRole="admin">     – admin or superAdmin
 *   <ProtectedRoute requiredRole="superAdmin">– superAdmin only
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
    const { currentUser, hasRole, authLoading } = useAuth();
    const location = useLocation();

    // Still resolving initial auth state — render nothing (AuthProvider shows
    // its own full-page loader).
    if (authLoading) return null;

    // Not logged in → send to the auth page with the Log in tab pre-selected,
    // and remember where they were headed so signup/login can return them there.
    // `mode=login` is written into the URL (not just state) so the tab survives
    // a refresh and the link stays shareable.
    if (!currentUser) {
        return (
            <Navigate
                to="/signup?mode=login"
                state={{ from: location }}
                replace
            />
        );
    }

    // Role checks. Admin landing is the shared /dashboard route (Admin Dashboard
    // for staff, student Dashboard for everyone else). Syllabus Admin remains a
    // separate existing page, not the primary home.
    const adminHome = '/dashboard';

    if (requiredRole === 'superAdmin' && !hasRole('superAdmin')) {
        return (
            <Navigate
                to={hasRole('admin') ? adminHome : '/dashboard'}
                replace
            />
        );
    }

    if (requiredRole === 'admin' && !hasRole('admin')) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}
