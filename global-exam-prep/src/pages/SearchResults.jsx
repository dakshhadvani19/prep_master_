import React, { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Book, Layers, GraduationCap, ChevronRight } from 'lucide-react';
import { domains } from '../data/mockData';

export default function SearchResults() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';

    const searchableItems = useMemo(() => {
        const items = [];
        domains.forEach(domain => {
            // Include domain
            items.push({ type: 'Domain', id: domain.id, title: domain.title, path: `/domains/${domain.id}/courses`, icon: <Layers size={20} className="text-blue-400" /> });
            
            domain.courses.forEach(course => {
                // Include course
                items.push({ type: 'Course', id: course.id, title: course.title, path: `/courses/${course.id}/subjects`, domainTitle: domain.title, icon: <GraduationCap size={20} className="text-purple-400" /> });
                
                course.subjects.forEach(subject => {
                    // Include subject
                    items.push({ 
                        type: 'Subject', 
                        id: subject.id, 
                        title: subject.title, 
                        path: `/courses/${course.id}/subjects#${subject.id}`, 
                        courseTitle: course.title, 
                        sem: subject.sem,
                        icon: <Book size={20} className="text-orange-400" /> 
                    });
                });
            });
        });
        return items;
    }, []);

    const results = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase().replace(/[\.\s\-]/g, '');
        
        // Prioritize exact matches and sort by type to ensure Domain/Course appear before Subjects
        let exactMatches = [];
        let partialMatches = [];
        
        searchableItems.forEach(item => {
            const itemTitle = item.title.toLowerCase().replace(/[\.\s\-]/g, '');
            const itemId = (item.id || '').toLowerCase().replace(/[\.\s\-]/g, '');
            
            if (itemTitle.includes(q) || itemId.includes(q)) {
                if (itemTitle === q || itemId === q) {
                    exactMatches.push(item);
                } else {
                    partialMatches.push(item);
                }
            }
        });

        const typeOrder = { 'Domain': 1, 'Course': 2, 'Subject': 3 };
        
        exactMatches.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
        partialMatches.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
        
        return [...exactMatches, ...partialMatches];
    }, [query, searchableItems]);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 2rem' }}>
            <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                    Search <span className="text-gradient">Results</span>
                </h1>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '1.1rem' }}>
                    {results.length} results found for "{query}"
                </p>
            </div>

            {results.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    {results.map((item, idx) => (
                        <Link 
                            key={`${item.id}-${item.type}-${idx}`} 
                            to={item.path}
                            className="glass-card"
                            style={{ 
                                padding: '1.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '1rem',
                                textDecoration: 'none',
                                transition: 'all 0.3s ease',
                                border: '1px solid var(--glass-border)',
                                animation: `fadeIn 0.5s ease-out ${idx * 0.05}s both`
                            }}
                        >
                            <div style={{ 
                                background: 'rgba(255,255,255,0.05)', 
                                padding: '0.75rem', 
                                borderRadius: 'var(--radius-md)',
                                display: 'flex'
                            }}>
                                {item.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                    <span style={{ 
                                        fontSize: '0.7rem', 
                                        fontWeight: 700, 
                                        padding: '0.15rem 0.5rem', 
                                        borderRadius: 'var(--radius-sm)', 
                                        background: 'rgba(255,255,255,0.1)',
                                        color: 'var(--text-secondary)',
                                        textTransform: 'uppercase'
                                    }}>
                                        {item.type}
                                    </span>
                                    {item.sem && (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                            • Sem {item.sem}
                                        </span>
                                    )}
                                </div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                    {item.title}
                                </h3>
                                {(item.courseTitle || item.domainTitle) && (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', margin: 0 }}>
                                        {item.courseTitle || item.domainTitle}
                                    </p>
                                )}
                            </div>
                            <ChevronRight size={18} color="var(--text-tertiary)" />
                        </Link>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '5rem 0' }}>
                    <Search size={64} color="rgba(255,255,255,0.1)" style={{ marginBottom: '1.5rem' }} />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        No results found
                    </h2>
                    <p style={{ color: 'var(--text-tertiary)' }}>
                        Try searching for something else, or browse our <Link to="/" style={{ color: 'var(--accent-primary)' }}>domains</Link>.
                    </p>
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .glass-card:hover {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: var(--accent-primary);
                    transform: translateY(-2px);
                    box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
                }
            `}</style>
        </div>
    );
}
