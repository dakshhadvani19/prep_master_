import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, Search, User, LogOut, LogIn, ChevronRight, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { domains } from '../data/mockData';

export default function Layout() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [searchQuery, setSearchQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);

    // Close suggestions on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Close suggestions on route change
    useEffect(() => {
        setShowSuggestions(false);
        setSearchQuery('');
    }, [location.pathname]);

    // Flatten domains into searchable items
    const searchableItems = useMemo(() => {
        const items = [];
        domains.forEach(domain => {
            items.push({ type: 'Domain', id: domain.id, title: domain.title, path: `/domains/${domain.id}/courses` });
            domain.courses.forEach(course => {
                items.push({ type: 'Course', id: course.id, title: course.title, path: `/courses/${course.id}/subjects`, domainTitle: domain.title });
                course.subjects.forEach(subject => {
                    items.push({ type: 'Subject', id: subject.id, title: subject.title, path: `/courses/${course.id}/subjects#${subject.id}`, courseTitle: course.title });
                });
            });
        });
        return items;
    }, []);

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const query = searchQuery.toLowerCase();
        return searchableItems.filter(item =>
            item.title.toLowerCase().includes(query) ||
            (item.courseTitle && item.courseTitle.toLowerCase().includes(query)) ||
            (item.domainTitle && item.domainTitle.toLowerCase().includes(query)) ||
            item.id.toLowerCase().includes(query)
        ).slice(0, 6);
    }, [searchQuery, searchableItems]);

    async function handleLogout() {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Failed to log out', error);
        }
    }

    function handleContactClick() {
        if (location.pathname === '/') {
            // Already on landing page — just scroll
            const el = document.getElementById('contact');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // Navigate to home then scroll after render
            navigate('/');
            setTimeout(() => {
                const el = document.getElementById('contact');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 400);
        }
    }

    return (
        <>
            <nav className="glass-panel" style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                borderBottom: '1px solid var(--glass-border)',
                borderRadius: 0,
                padding: '1rem 2rem'
            }}>
                <div className="container" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 0
                }}>
                    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            background: 'var(--accent-gradient)',
                            padding: '0.5rem',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <BookOpen size={24} color="white" />
                        </div>
                        <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Prep<span className="text-gradient">Master</span>
                        </span>
                    </Link>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <button
                            onClick={handleContactClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                color: 'var(--text-secondary)',
                                fontSize: '0.95rem',
                                fontWeight: 500,
                                padding: '0.5rem 1rem',
                                borderRadius: 'var(--radius-full)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.04)',
                                transition: 'all var(--transition-normal)',
                                cursor: 'pointer'
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                            onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                        >
                            <Mail size={16} /> Contact
                        </button>
                        <div ref={searchRef} style={{ position: 'relative' }}>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (filteredItems.length > 0) {
                                        navigate(filteredItems[0].path);
                                        setShowSuggestions(false);
                                        setSearchQuery('');
                                    }
                                }}
                                className="glass-panel" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: 'var(--radius-full)',
                                    transition: 'all var(--transition-normal)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    background: 'rgba(0, 0, 0, 0.2)',
                                    cursor: 'text',
                                    position: 'relative',
                                    zIndex: 101
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.2)';
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <Search size={18} color="var(--text-secondary)" style={{ minWidth: '18px' }} />
                                <input
                                    name="search"
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    placeholder="Search any course or subject..."
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem',
                                        fontFamily: 'inherit',
                                        width: '280px',
                                        transition: 'width var(--transition-normal)'
                                    }}
                                />
                            </form>

                            {showSuggestions && searchQuery.trim() !== '' && (
                                <div className="glass-panel" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    marginTop: '0.5rem',
                                    padding: '0.5rem',
                                    borderRadius: 'var(--radius-lg)',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--glass-border)',
                                    boxShadow: 'var(--shadow-lg)',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    zIndex: 100
                                }}>
                                    {filteredItems.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {filteredItems.map(item => (
                                                <Link
                                                    key={item.id + item.type}
                                                    to={item.path}
                                                    style={{
                                                        padding: '0.75rem',
                                                        borderRadius: 'var(--radius-md)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        transition: 'background var(--transition-fast)'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                    onClick={() => {
                                                        setShowSuggestions(false);
                                                        setSearchQuery('');
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                        <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                                                            {item.title}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                            {item.type} {item.courseTitle ? `• ${item.courseTitle}` : item.domainTitle ? `• ${item.domainTitle}` : ''}
                                                        </span>
                                                    </div>
                                                    <ChevronRight size={16} color="var(--text-secondary)" />
                                                </Link>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                            No results found for "{searchQuery}"
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {currentUser ? (
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <Link to="/dashboard" style={{
                                    background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--glass-border)',
                                    padding: '0.5rem',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all var(--transition-normal)'
                                }} title="Dashboard">
                                    <User size={20} color="var(--accent-primary)" />
                                </Link>
                                <button onClick={handleLogout} style={{
                                    background: 'transparent',
                                    border: '1px solid var(--glass-border)',
                                    padding: '0.5rem',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all var(--transition-normal)',
                                    cursor: 'pointer'
                                }} title="Log Out">
                                    <LogOut size={20} color="var(--danger)" />
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <Link to="/login" style={{
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontWeight: 500,
                                    fontSize: '0.95rem'
                                }}>
                                    <LogIn size={18} />
                                    Log In
                                </Link>
                                <Link to="/signup" style={{
                                    background: 'var(--accent-gradient)',
                                    color: 'white',
                                    padding: '0.5rem 1.25rem',
                                    borderRadius: 'var(--radius-full)',
                                    fontWeight: 600,
                                    fontSize: '0.95rem',
                                    boxShadow: 'var(--shadow-md)',
                                    transition: 'transform var(--transition-fast)'
                                }}>
                                    Sign Up
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            <main style={{ flex: 1, padding: '2rem 0' }}>
                <Outlet />
            </main>

            <footer style={{
                borderTop: '1px solid var(--glass-border)',
                padding: '2rem 0',
                marginTop: 'auto',
                textAlign: 'center',
                color: 'var(--text-tertiary)'
            }}>
                <p>© 2026 PrepMaster — Built by <strong>Daksh Hadvani</strong>. University Exam Preparation Platform.</p>
            </footer>
        </>
    );
}
