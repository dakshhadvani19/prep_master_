import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, GraduationCap, Clock, Loader, AlertCircle, ArrowUpRight } from 'lucide-react';
import { fetchCoursesForDomain, getCatalogDomain } from '../utils/catalogApi';

const MotionLink = motion(Link);
const smoothEase = [0.22, 1, 0.36, 1];

const gridVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.065 } },
};
const cardVariants = {
    hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.58, ease: smoothEase } },
};

export default function CourseExplorer() {
    const { domainId } = useParams();
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
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
        return <div className="container pm-catalog-page pm-course-page" style={{ textAlign: 'center', marginTop: '4rem' }}><h2>Domain not found</h2></div>;
    }

    return (
        <div className="container animate-fade-in pm-catalog-page pm-course-page">
            <button className="pm-catalog-back" onClick={() => navigate(-1)}>
                <ChevronLeft size={17} /> Back to Domains
            </button>

            <motion.header
                className="pm-course-header"
                initial={reduceMotion ? false : { opacity: 0, y: 16, filter: 'blur(5px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.72, ease: smoothEase }}
            >
                <p className="pm-catalog-kicker">Your academic path</p>
                <h1>{domain?.title || domainMeta.title} <span>Programs</span></h1>
                <p className="pm-catalog-description">
                    Select your specific degree program to view subjects and prepare for your upcoming examinations.
                </p>
            </motion.header>

            {loading && (
                <div data-testid="catalog-loading" className="pm-catalog-state">
                    <Loader size={21} className="spinner" /> Loading courses…
                </div>
            )}

            {!loading && error && (
                <div data-testid="catalog-error" className="pm-catalog-message">
                    <AlertCircle size={22} />
                    <div>
                        <h3>Could not load courses</h3>
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {!loading && !error && courses.length === 0 && (
                <div data-testid="catalog-empty" className="pm-catalog-message pm-catalog-message--empty">
                    No courses are listed for this department yet.
                </div>
            )}

            {!loading && !error && courses.length > 0 && (
                <motion.div
                    className="pm-course-grid"
                    variants={gridVariants}
                    initial={reduceMotion ? false : 'hidden'}
                    animate="visible"
                >
                    {courses.map((courseItem) => (
                        <MotionLink
                            key={courseItem.courseId}
                            to={'/courses/' + courseItem.courseId + '/subjects'}
                            className="pm-course-card"
                            variants={cardVariants}
                            whileHover={reduceMotion ? undefined : { y: -5, scale: 1.008 }}
                            whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                            transition={{ duration: 0.3, ease: smoothEase }}
                        >
                            <div className="pm-course-card__top">
                                <div className="pm-course-mark"><GraduationCap size={23} /></div>
                                <span className="pm-course-count">{courseItem.sems?.length || 0} Semesters</span>
                            </div>
                            <h2 className="pm-course-name">{courseItem.courseName}</h2>
                            <div className="pm-course-card__meta"><Clock size={15} /> 3 Exams / Subject</div>
                            <span className="pm-course-action">View syllabus <ArrowUpRight size={15} /></span>
                        </MotionLink>
                    ))}
                </motion.div>
            )}
        </div>
    );
}
