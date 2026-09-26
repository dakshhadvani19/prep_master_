/**
 * Admin Courses entry (Phase 2) — placeholder only.
 * Real Course / Subject / Question CRUD is Phase 3.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Layers, ListTree, HelpCircle, ArrowLeft } from 'lucide-react';
import './AdminDashboard.css';

const PHASE3 = 'Phase 3 — catalog editing is not wired yet. Nothing was saved.';

export default function AdminCourses() {
    const [notice, setNotice] = useState('');

    return (
        <div className="admin-dash">
            <header className="admin-dash__hero">
                <div>
                    <div className="admin-dash__kicker">Admin · Courses</div>
                    <h1 className="admin-dash__title">Catalog structure</h1>
                    <p className="admin-dash__sub">Next phase manages this tree. This screen is an entry point only.</p>
                </div>
                <Link to="/dashboard" className="admin-chip" style={{ textDecoration: 'none' }}>
                    <ArrowLeft size={12} style={{ marginRight: 4 }} /> Dashboard
                </Link>
            </header>

            <div className="admin-grid">
                <section className="admin-card admin-card--span-12">
                    <div className="admin-card__head">
                        <div>
                            <h2 className="admin-card__title">Course → Semester → Subjects → Questions</h2>
                            <p className="admin-card__hint">Matches the planned admin catalog flow. No tables are written.</p>
                        </div>
                        <span className="admin-card__tag">Phase 3</span>
                    </div>

                    <div className="admin-tree">
                        <div className="admin-tree__node"><BookOpen size={16} /> Course <span>select / add / edit</span></div>
                        <div className="admin-tree__node" style={{ marginLeft: '1.25rem' }}><Layers size={16} /> Semester <span>from the course Sems list</span></div>
                        <div className="admin-tree__node" style={{ marginLeft: '2.5rem' }}><ListTree size={16} /> Subjects <span>choose course and subject</span></div>
                        <div className="admin-tree__node" style={{ marginLeft: '3.75rem' }}><HelpCircle size={16} /> Questions <span>TestsData</span></div>
                    </div>

                    <div className="admin-ops">
                        <div>
                            <h3>Subjects</h3>
                            <ul>
                                {['Add subject', 'Edit subject', 'Update subject', 'Remove subject'].map((label) => (
                                    <li key={label}>
                                        <button type="button" onClick={() => setNotice(PHASE3)}>{label}</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h3>Questions</h3>
                            <ul>
                                {['Add question', 'Edit question', 'Update question', 'Remove question'].map((label) => (
                                    <li key={label}>
                                        <button type="button" onClick={() => setNotice(PHASE3)}>{label}</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    {notice && <div className="admin-banner" role="status">{notice}</div>}
                </section>
            </div>
        </div>
    );
}
