import { useParams, Link, useNavigate } from 'react-router-dom';
import { domains } from '../data/mockData';
import { ChevronLeft, GraduationCap, Clock, BookOpen } from 'lucide-react';

export default function CourseExplorer() {
    const { domainId } = useParams();
    const navigate = useNavigate();
    const domain = domains.find(d => d.id === domainId);

    if (!domain) {
        return <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}><h2>Domain not found</h2></div>;
    }

    return (
        <div className="container animate-fade-in">
            <button
                onClick={() => navigate(-1)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '2rem',
                    fontSize: '0.9rem'
                }}
            >
                <ChevronLeft size={16} /> Back to Domains
            </button>

            <header style={{ marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                    {domain.title} <span className="text-gradient">Programs</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '600px' }}>
                    Select your specific degree program to view subjects and prepare for your upcoming examinations.
                </p>
            </header>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: '2rem'
            }}>
                {domain.courses.map(course => (
                    <Link
                        key={course.id}
                        to={`/courses/${course.id}/subjects`}
                        className="glass-panel"
                        style={{
                            padding: '2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'transform var(--transition-normal), box-shadow var(--transition-normal)',
                            textDecoration: 'none'
                        }}
                        onMouseOver={e => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                            e.currentTarget.style.borderColor = 'var(--accent-primary)';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = 'var(--glass-border)';
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <div style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                padding: '0.75rem',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--accent-primary)'
                            }}>
                                <GraduationCap size={24} />
                            </div>
                            <span style={{
                                background: 'var(--bg-tertiary)',
                                padding: '0.25rem 0.75rem',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)'
                            }}>
                                {course.semesters} Semesters
                            </span>
                        </div>

                        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.4rem' }}>{course.title}</h3>

                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            marginTop: 'auto',
                            paddingTop: '1.5rem',
                            color: 'var(--text-tertiary)',
                            fontSize: '0.9rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <BookOpen size={16} /> {course.subjects.length} Subjects
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Clock size={16} /> 3 Exams / Subject
                            </div>
                        </div>

                        <div style={{
                            marginTop: '1.5rem',
                            width: '100%',
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--accent-primary)',
                            fontWeight: 500,
                            transition: 'background var(--transition-fast)'
                        }}>
                            View Syllabus
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
