/**
 * ProtectedRoute.jsx
 *
 * Wraps routes that require authentication (and optionally a specific role).
 *
 * Usage:
 *   <ProtectedRoute>                         – any authenticated user
 *   <ProtectedRoute requiredRole="admin">    – must be admin or superAdmin
 *   <ProtectedRoute requiredRole="superAdmin">– must be superAdmin only
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
    const { currentUser, isAdmin, isSuperAdmin, authLoading } = useAuth();
    const location = useLocation();

    // Still resolving initial auth state — render nothing (spinner is in AuthProvider)
    if (authLoading) return null;

    // Not logged in → send to signup, preserving intended destination
    if (!currentUser) {
        return <Navigate to="/signup" state={{ from: location }} replace />;
    }

    // Role checks
    if (requiredRole === 'superAdmin' && !isSuperAdmin) {
        // Regular admin or student trying to access super-admin-only route
        return <Navigate to={isAdmin ? '/admin/dashboard' : '/dashboard'} replace />;
    }

    if (requiredRole === 'admin' && !isAdmin) {
        // Student trying to access admin route
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}