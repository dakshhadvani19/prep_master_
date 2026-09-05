import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, Search, User, LogOut, LogIn, ChevronRight, Menu, X, Home, Trophy, CreditCard, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { domains } from '../data/mockData';

export default function Layout() {
    const { currentUser, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [searchQuery, setSearchQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [hoveredNav, setHoveredNav] = useState(null);
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

    // Close mobile menu and suggestions on route change
    useEffect(() => {
        setShowSuggestions(false);
        setSearchQuery('');
        setMobileMenuOpen(false);
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
        const query = searchQuery.toLowerCase().replace(/[\.\s\-]/g, '');

        // Prioritize exact matches and sort by type to ensure Domain/Course appear before Subjects
        let exactMatches = [];
        let partialMatches = [];

        searchableItems.forEach(item => {
            const itemTitle = item.title.toLowerCase().replace(/[\.\s\-]/g, '');
            const itemId = item.id.toLowerCase().replace(/[\.\s\-]/g, '');

            if (itemTitle.includes(query) || itemId.includes(query)) {
                if (itemTitle === query || itemId === query) {
                    exactMatches.push(item);
                } else {
                    partialMatches.push(item);
                }
            }
        });

        const typeOrder = { 'Domain': 1, 'Course': 2, 'Subject': 3 };

        exactMatches.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
        partialMatches.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

        return [...exactMatches, ...partialMatches].slice(0, 6);
    }, [searchQuery, searchableItems]);

    async function handleLogout() {
        try {
            await logout();
            navigate('/signup?mode=login');
        } catch (error) {
            console.error('Failed to log out', error);
        }
    }


    const navItems = [
        { id: 'home', label: 'Home', path: '/' },
        { id: 'leaderboards', label: 'Leaderboards', path: '/leaderboards' },
        { id: 'feedback', label: 'Feedback', path: '/feedback' },
        { id: 'subscriptions', label: 'Subscriptions', path: '/subscriptions' },
    ];

    const getActiveNavId = () => {
        if (location.pathname === '/' ||
            location.pathname.startsWith('/domains') ||
            location.pathname.startsWith('/courses') ||
            location.pathname.startsWith('/exams')) return 'home';
        if (location.pathname.startsWith('/leaderboards')) return 'leaderboards';
        if (location.pathname.startsWith('/feedback')) return 'feedback';
        if (location.pathname.startsWith('/subscriptions')) return 'subscriptions';
        return null;
    };
    const activeNavId = getActiveNavId();
    const activeBackgroundId = hoveredNav || activeNavId;

    return (
        <>
            <nav style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                background: 'rgba(15, 17, 21, 0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottom: '1px solid var(--glass-border)',
            }}>
                <div style={{
                    maxWidth: '1400px',
                    margin: '0 auto',
                    padding: '0 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '64px',
                    gap: '0.75rem',
                }}>
                    {/* Logo */}
                    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        <div style={{
                            background: 'var(--accent-gradient)',
                            padding: '0.45rem',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <BookOpen size={22} color="white" />
                        </div>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Prep<span className="text-gradient">Master</span>
                        </span>
                    </Link>

                    {/* Desktop Nav */}
                    <div
                        className="nav-desktop"
                        onMouseLeave={() => setHoveredNav(null)}
                        style={{
                            display: 'flex',
                            gap: '0.1rem',
                            alignItems: 'center',
                            flexShrink: 0,
                            padding: '0.3rem',
                            background: 'rgba(22, 24, 29, 0.65)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: 'var(--radius-full)',
                            backdropFilter: 'blur(30px)',
                            WebkitBackdropFilter: 'blur(30px)',
                            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 10px 25px rgba(0, 0, 0, 0.4)'
                        }}
                    >
                        {navItems.map(item => {
                            const isHovered = hoveredNav === item.id;
                            const isCurrent = activeNavId === item.id;
                            const showPill = activeBackgroundId === item.id;

                            return (
                                <div
                                    key={item.id}
                                    style={{ position: 'relative', display: 'flex', height: '36px' }}
                                    onMouseEnter={() => setHoveredNav(item.id)}
                                >
                                    {showPill && (
                                        <motion.div
                                            layoutId="nav-desktop-pill"
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03))',
                                                backdropFilter: 'blur(12px)',
                                                WebkitBackdropFilter: 'blur(12px)',
                                                border: '1px solid rgba(255, 255, 255, 0.18)',
                                                borderRadius: 'var(--radius-full)',
                                                zIndex: 0,
                                                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.15)',
                                            }}
                                            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                                        />
                                    )}
                                    <motion.div
                                        whileTap={{ scale: 0.94 }}
                                        style={{ display: 'flex', position: 'relative', zIndex: 1 }}
                                    >
                                        {item.isButton ? (
                                            <button
                                                onClick={handleContactClick}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    padding: '0 1.25rem',
                                                    lineHeight: '1',
                                                    fontFamily: 'inherit',
                                                    color: showPill ? 'white' : 'var(--text-secondary)',
                                                    fontWeight: isCurrent ? 700 : 500,
                                                    fontSize: '0.92rem',
                                                    cursor: 'pointer',
                                                    transition: 'color 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                {item.label}
                                            </button>
                                        ) : (
                                            <Link
                                                to={item.path}
                                                style={{
                                                    padding: '0 1.25rem',
                                                    lineHeight: '1',
                                                    fontFamily: 'inherit',
                                                    color: showPill ? 'white' : 'var(--text-secondary)',
                                                    fontWeight: isCurrent ? 700 : 500,
                                                    fontSize: '0.92rem',
                                                    textDecoration: 'none',
                                                    transition: 'color 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                {item.label}
                                            </Link>
                                        )}
                                    </motion.div>
                                </div>
                            );
                        })}

                        {/* Search */}
                        <div ref={searchRef} style={{ position: 'relative' }}>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (searchQuery.trim()) {
                                        navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
                                        setShowSuggestions(false);
                                    }
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.5rem 1rem',
                                    borderRadius: 'var(--radius-full)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    background: 'rgba(0, 0, 0, 0.2)',
                                    position: 'relative',
                                    zIndex: 101,
                                    transition: 'border-color 0.2s',
                                }}
                            >
                                <button
                                    type="submit"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        cursor: 'pointer'
                                    }}
                                    title="Search"
                                    aria-label="Submit Search"
                                >
                                    <Search size={16} color="var(--text-secondary)" style={{ minWidth: '16px' }} />
                                </button>
                                <input
                                    name="search"
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                                    onFocus={() => setShowSuggestions(true)}
                                    placeholder="Search courses or subjects..."
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.875rem',
                                        fontFamily: 'inherit',
                                        width: 'clamp(120px, 15vw, 200px)',
                                    }}
                                />
                            </form>

                            {showSuggestions && searchQuery.trim() !== '' && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '0.5rem',
                                    padding: '0.5rem',
                                    borderRadius: 'var(--radius-lg)',
                                    width: 'clamp(300px, 400px, 90vw)',
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
                                                    onClick={() => { setShowSuggestions(false); setSearchQuery(''); }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                        <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{item.title}</span>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                            {item.type}{item.courseTitle ? ` • ${item.courseTitle}` : item.domainTitle ? ` • ${item.domainTitle}` : ''}
                                                        </span>
                                                    </div>
                                                    <ChevronRight size={14} color="var(--text-secondary)" />
                                                </Link>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                            No results found for "{searchQuery}"
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Auth Buttons */}
                        {currentUser ? (
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <Link to="/dashboard" style={{
                                    background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--glass-border)',
                                    padding: '0.45rem',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all var(--transition-normal)'
                                }} title="Dashboard" aria-label="Go to Dashboard">
                                    <User size={18} color="var(--accent-primary)" />
                                </Link>
                                <button onClick={handleLogout} style={{
                                    background: 'transparent',
                                    border: '1px solid var(--glass-border)',
                                    padding: '0.45rem',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all var(--transition-normal)',
                                    cursor: 'pointer'
                                }} title="Log Out" aria-label="Log Out of Account">
                                    <LogOut size={18} color="var(--danger)" />
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <Link to="/signup?mode=login" style={{
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    fontWeight: 500,
                                    fontSize: '0.9rem'
                                }}>
                                    <LogIn size={16} /> Log In
                                </Link>
                                <Link to="/signup?mode=signup" style={{
                                    background: 'var(--accent-gradient)',
                                    color: 'white',
                                    padding: '0.45rem 1.1rem',
                                    borderRadius: 'var(--radius-full)',
                                    fontWeight: 600,
                                    fontSize: '0.875rem',
                                    boxShadow: 'var(--shadow-md)',
                                    whiteSpace: 'nowrap',
                                }}>
                                    Sign Up
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Mobile Hamburger */}
                    <button
                        className="nav-mobile-toggle"
                        onClick={() => setMobileMenuOpen(prev => !prev)}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--glass-border)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.45rem',
                            cursor: 'pointer',
                            display: 'none',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-primary)',
                        }}
                        aria-label="Toggle menu"
                    >
                        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>

                {/* Mobile Dropdown Menu */}
                {mobileMenuOpen && (
                    <div style={{
                        background: 'rgba(15, 17, 21, 0.98)',
                        borderTop: '1px solid var(--glass-border)',
                        padding: '1rem 1.5rem 1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                    }}>
                        {/* Mobile Search */}
                        <div ref={searchRef} style={{ position: 'relative' }}>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (searchQuery.trim()) {
                                        navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
                                        setShowSuggestions(false);
                                        setMobileMenuOpen(false);
                                    }
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.65rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    width: '100%',
                                }}
                            >
                                <button
                                    type="submit"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        cursor: 'pointer'
                                    }}
                                    title="Search"
                                >
                                    <Search size={16} color="var(--text-secondary)" />
                                </button>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                                    onFocus={() => setShowSuggestions(true)}
                                    placeholder="Search courses or subjects..."
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem',
                                        fontFamily: 'inherit',
                                        flex: 1,
                                    }}
                                />
                            </form>
                            {showSuggestions && searchQuery.trim() !== '' && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    marginTop: '0.5rem',
                                    padding: '0.5rem',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--glass-border)',
                                    maxHeight: '250px',
                                    overflowY: 'auto',
                                    zIndex: 100,
                                }}>
                                    {filteredItems.length > 0 ? filteredItems.map(item => (
                                        <Link
                                            key={item.id + item.type}
                                            to={item.path}
                                            style={{ padding: '0.65rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => { setShowSuggestions(false); setSearchQuery(''); setMobileMenuOpen(false); }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{item.title}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{item.type}</div>
                                            </div>
                                            <ChevronRight size={13} color="var(--text-tertiary)" />
                                        </Link>
                                    )) : (
                                        <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No results found</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Mobile Home */}
                        <Link to="/" style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500,
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--glass-border)',
                            background: 'rgba(255,255,255,0.03)',
                        }}>
                            <Home size={18} color="var(--accent-primary)" /> Home
                        </Link>

                        {/* Mobile Leaderboards */}
                        <Link to="/leaderboards" style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500,
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--glass-border)',
                            background: 'rgba(255,255,255,0.03)',
                        }}>
                            <Trophy size={18} color="#f59e0b" /> Leaderboards
                        </Link>

                        {/* Mobile Feedback */}
                        <Link to="/feedback" style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500,
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--glass-border)',
                            background: 'rgba(255,255,255,0.03)',
                        }}>
                            <MessageSquare size={18} color="#a78bfa" /> Feedback
                        </Link>

                        {/* Mobile Subscriptions */}
                        <Link to="/subscriptions" style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500,
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--glass-border)',
                            background: 'rgba(255,255,255,0.03)',
                        }}>
                            <CreditCard size={18} color="#34d399" /> Subscriptions
                        </Link>
                        <div style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                            {currentUser ? (
                                <>
                                    {isAdmin && (
                                        <Link to="/admin/syllabus" style={{
                                            width: '100%', textAlign: 'center', padding: '0.75rem',
                                            background: 'rgba(234,179,8,0.1)', borderRadius: 'var(--radius-md)',
                                            border: '1px solid rgba(234,179,8,0.3)', color: '#eab308',
                                            fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                            marginBottom: '0.5rem',
                                        }}>
                                            <Shield size={16} /> Syllabus Admin
                                        </Link>
                                    )}
                                    <Link to="/dashboard" style={{
                                        flex: 1, textAlign: 'center', padding: '0.75rem',
                                        background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--glass-border)', color: 'var(--accent-primary)',
                                        fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                    }}>
                                        <User size={16} /> Dashboard
                                    </Link>
                                    <button onClick={handleLogout} style={{
                                        flex: 1, padding: '0.75rem',
                                        background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)',
                                        fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                    }}>
                                        <LogOut size={16} /> Log Out
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link to="/signup?mode=login" style={{
                                        flex: 1, textAlign: 'center', padding: '0.75rem',
                                        background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--glass-border)', color: 'var(--text-primary)',
                                        fontWeight: 600, fontSize: '0.9rem'
                                    }}>
                                        Log In
                                    </Link>
                                    <Link to="/signup?mode=signup" style={{
                                        flex: 1, textAlign: 'center', padding: '0.75rem',
                                        background: 'var(--accent-gradient)', borderRadius: 'var(--radius-md)',
                                        color: 'white', fontWeight: 600, fontSize: '0.9rem'
                                    }}>
                                        Sign Up
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </nav>

            <main style={{ flex: 1, padding: '2rem 0' }}>
                <Outlet />
            </main>

            <footer style={{
                borderTop: '1px solid var(--glass-border)',
                padding: '1.5rem 1.5rem',
                marginTop: 'auto',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.875rem',
                display: 'none'
            }}>
                <p>© 2026 PrepMaster — Built by <strong style={{ color: 'var(--text-secondary)' }}>Daksh Hadvani</strong>. University Exam Preparation Platform.</p>
            </footer>

            <style>{`
                @media (max-width: 900px) {
                    .nav-desktop { display: none !important; }
                    .nav-mobile-toggle { display: flex !important; }
                }
                @media (min-width: 901px) {
                    .nav-mobile-toggle { display: none !important; }
                    .nav-desktop { display: flex !important; }
                }
            `}</style>
        </>
    );
}
