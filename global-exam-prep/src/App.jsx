import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import CourseExplorer from './pages/CourseExplorer';
import SubjectDetails from './pages/SubjectDetails';
import ExamPortal from './pages/ExamPortal';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="domains/:domainId/courses" element={<CourseExplorer />} />
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
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
