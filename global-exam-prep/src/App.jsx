import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import React, { useEffect, Suspense, lazy } from 'react';
import Layout from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { Loader } from 'lucide-react';
import './index.css';

// Lazy loading route components for FAANG-level performance splitting
const LandingPage = lazy(() => import('./pages/LandingPage'));
const CourseExplorer = lazy(() => import('./pages/CourseExplorer'));
const SubjectDetails = lazy(() => import('./pages/SubjectDetails'));
const ExamPortal = lazy(() => import('./pages/ExamPortal'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));

const Signup = lazy(() => import('./pages/Signup'));
const SearchResults = lazy(() => import('./pages/SearchResults'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const SyllabusAdmin = lazy(() => import('./pages/SyllabusAdmin'));
const UserGuide = lazy(() => import('./pages/UserGuide'));


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/**
 * Redirects the legacy /login (and /register) URLs to the unified auth page
 * while carrying `location.state` across. A bare <Navigate to="..."/> would
 * discard it, which silently broke "return to the page you came from".
 */
function ForwardToAuth({ mode }) {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: '/signup', search: `?mode=${mode}` }}
      state={location.state}
      replace
    />
  );
}

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '6rem 1.5rem' }}>
      <h1 style={{ fontSize: '6rem', fontWeight: 800, margin: 0, lineHeight: 1 }}>404</h1>
      <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', margin: '1rem 0 2rem' }}>
        Page not found.
      </p>
      <Link to="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        background: 'var(--accent-gradient)', color: 'white',
        padding: '0.65rem 1.5rem', borderRadius: 'var(--radius-full)',
        fontWeight: 600, fontSize: '0.95rem',
      }}>
        Back to Home
      </Link>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
          <Suspense fallback={
            <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader size={32} className="spinner" style={{ color: 'var(--accent-primary)' }} />
            </div>
          }>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<LandingPage />} />
                <Route path="login" element={<ForwardToAuth mode="login" />} />
                <Route path="register" element={<ForwardToAuth mode="signup" />} />
                <Route path="signup" element={<Signup />} />
                <Route path="domains/:domainId/courses" element={<CourseExplorer />} />
                <Route path="search" element={<SearchResults />} />
                <Route path="feedback" element={<FeedbackPage />} />
                <Route path="guide" element={<UserGuide />} />
                <Route path="courses/:courseId/subjects" element={<SubjectDetails />} />
                <Route
                  path="exams/:subjectId/:examType/:difficulty"
                  element={
                    <ProtectedRoute>
                      <ExamPortal />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="review/:historyId"
                  element={
                    <ProtectedRoute>
                      <ReviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/syllabus"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <SyllabusAdmin />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
