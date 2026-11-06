import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    Building2,
    ChevronLeft,
    ChevronRight,
    Clock,
    GraduationCap,
    LoaderCircle,
} from 'lucide-react';
import { fetchCoursesForDomain, getCatalogDomain } from '../utils/catalogApi';
import './Leaderboard.css';
import './CatalogFlow.css';

export default function CourseExplorer() {
    const { domainId } = useParams();
    const navigate = useNavigate();
    const domainMeta = getCatalogDomain(domainId);

    const [courses, setCourses] = useState([]);
    const [domain, setDomain] = useState(domainMeta);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchCoursesForDomain(domainId).then((result) => {
            if (cancelled) return;
            setDomain(result.domain);
            setCourses(result.courses || []);
            setError(result.error ? (result.error.message || 'Could not load courses.') : null);
            setLoading(false);
        }).catch((err) => {
            if (cancelled) return;
            setError(err.message || 'Could not load courses.');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [domainId]);

    if (!domainMeta) {
        return (
            <main className="lb catalog-flow" data-testid="catalog-domain-not-found">
                <div className="lb-empty-state">
                    <span className="lb-empty-state__icon"><Building2 size={21} /></span>
                    <h3>Domain not found</h3>
                </div>
            </main>
        );
    }

    return (
        <main className="lb catalog-flow" data-testid="course-explorer">
            <button type="button" className="lb-back catalog-flow__back" onClick={() => navigate(-1)}>
                <ChevronLeft size={16} /> Back to Domains
            </button>

            <header className="lb-hero">
                <div className="lb-hero__copy">
                    <h1>{domain?.title || domainMeta.title} Programs</h1>
                    <p>
                        Select your specific degree program to view subjects and prepare for your upcoming examinations.
                    </p>
                </div>
                <div className="lb-hero__mark" aria-hidden="true">
                    <Building2 size={27} strokeWidth={1.7} />
                </div>
            </header>

            <section className="lb-browser" aria-label="Programs">
                {loading && (
                    <div className="lb-loading" data-testid="catalog-loading">
                        <LoaderCircle size={22} className="lb-spin" />
                        Loading courses…
                    </div>
                )}

                {!loading && error && (
                    <div data-testid="catalog-error" className="lb-alert" role="alert">
                        <AlertCircle size={19} />
                        <div>
                            <strong>Could not load courses</strong>
                            <p>{error}</p>
                        </div>
                    </div>
                )}

                {!loading && !error && courses.length === 0 && (
                    <div data-testid="catalog-empty" className="lb-empty-state">
                        <span className="lb-empty-state__icon"><GraduationCap size={21} /></span>
                        <h3>No courses are listed for this department yet.</h3>
                    </div>
                )}

                {!loading && !error && courses.length > 0 && (
                    <div className="lb-grid lb-grid--courses catalog-flow__course-grid">
                        {courses.map((course) => (
                            <Link
                                key={course.courseId}
                                to={`/courses/${course.courseId}/subjects`}
                                className="lb-choice catalog-flow__course"
                            >
                                <span className="lb-choice__icon" aria-hidden="true">
                                    <GraduationCap size={21} strokeWidth={1.8} />
                                </span>
                                <span className="lb-choice__copy">
                                    <span className="lb-choice__title">{course.courseName}</span>
                                    <span className="lb-choice__sub">{course.sems?.length || 0} Semesters</span>
                                    <span className="lb-choice__meta">
                                        <Clock size={14} aria-hidden="true" /> 3 Exams / Subject
                                    </span>
                                    <span className="lb-tag catalog-flow__course-action">View Syllabus</span>
                                </span>
                                <ChevronRight className="lb-choice__arrow" size={17} aria-hidden="true" />
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
