import React, { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import { domains } from '../data/mockData';
import * as Icons from 'lucide-react';
import './LandingPage.css';

export default function LandingPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const controls = useAnimation();

    // Developer Likes State
    const [liked, setLiked] = React.useState(() => {
        const saved = localStorage.getItem('dev_liked');
        return saved ? JSON.parse(saved) : false;
    });
    const [liked2, setLiked2] = React.useState(() => {
        const saved = localStorage.getItem('dev_liked_2');
        return saved ? JSON.parse(saved) : false;
    });

    // SEO Injection dynamically for this page
    useEffect(() => {
        document.title = "PrepMaster | University Exam Preparation Platform";

        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.name = "description";
            document.head.appendChild(metaDescription);
        }
        metaDescription.content = "Prepare for university exams including B.Tech, BCA, Law, and Diploma levels. Get 98% accurate syllabus-based questions covering Engineering, Management, Pharmacy, and Arts globally.";
    }, []);

    // Scroll to contact section when navigated here with scrollToContact state
    useEffect(() => {
        if (location.state?.scrollToContact) {
            const el = document.getElementById('contact');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Clear the state so a refresh doesn't re-trigger the scroll
            window.history.replaceState({}, '', location.pathname);
        }
    }, [location.state]);

    // Staggered animation variant
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { y: 30, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: "spring", stiffness: 100, damping: 12 }
        }
    };

    const handleMouseMove = e => {
        for (const card of document.getElementsByClassName("domain-card")) {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty("--mouse-x", `${x}px`);
            card.style.setProperty("--mouse-y", `${y}px`);
        }
    };

    return (
        <main onMouseMove={handleMouseMove}>
            {/* 3D Floating Hero Background Elements */}
            <div className="hero-shapes">
                <div className="floating-element el-1"><Icons.Code size={48} color="#3b82f6" /></div>
                <div className="floating-element el-2"><Icons.Database size={32} color="#8b5cf6" /></div>
                <div className="floating-element el-3"><Icons.Activity size={64} color="#10b981" /></div>
                <div className="floating-element el-4"><Icons.Cpu size={40} color="#ec4899" /></div>
            </div>

            <header className="hero-section">
                <motion.div
                    className="hero-content"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    {/* <motion.div
                        className="hero-badge"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                    >
                        <Icons.Award size={16} /> Now Supporting Global Universities
                    </motion.div> */}

                    <motion.h1
                        className="hero-title"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.8 }}
                    >
                        Master MU Exams <br />
                        With <span className="text-gradient">Surgical Precision</span>.
                    </motion.h1>

                    <motion.p
                        className="hero-description"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.8 }}
                    >
                        Generate hyper-accurate, 98% syllabus-matched mock examinations instantly. From strict subjective 7/14 marker questions to deeply technical complex MCQ objective sets across B.Tech, Diploma, Pharmacy, and Law degrees.
                    </motion.p>

                    <motion.div
                        className="hero-actions"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8, duration: 0.6 }}
                    >
                        <button className="btn-primary" onClick={() => window.scrollTo({ top: 800, behavior: 'smooth' })}>
                            Explore Programs <Icons.ChevronDown size={20} />
                        </button>
                        <button className="btn-secondary" onClick={() => navigate('/signup?mode=signup')}>
                            Create Free Account
                        </button>
                        <button className="btn-google-cta" onClick={() => navigate('/signup?mode=signup&method=google')}>
                            <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </button>
                    </motion.div>

                    <motion.div
                        className="stats-container"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2, duration: 1 }}
                    >
                        {/* <div className="stat-item">
                            <div className="stat-number">6+</div>
                            <div className="stat-label">Global Faculties</div>
                        </div> */}
                        <div className="stat-item">
                            <div className="stat-number">98%</div>
                            <div className="stat-label">Syllabus Accuracy</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-number">20+</div>
                            <div className="stat-label">Degree Programs</div>
                        </div>
                    </motion.div>
                </motion.div>
            </header>

            <section className="domains-section">
                <div className="section-header">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}
                    >
                        Select Your Academic <span className="text-gradient">Domain</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}
                    >
                        Choose your discipline below to instantly generate accurate exams.
                    </motion.p>
                </div>

                <motion.div
                    className="domain-grid"
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                >
                    {domains.map(domain => {
                        const IconComponent = Icons[domain.icon] || Icons.Book;
                        return (
                            <motion.article key={domain.id} variants={itemVariants}>
                                <Link to={`/domains/${domain.id}/courses`} className="domain-card">
                                    <div className="domain-icon-wrapper">
                                        <IconComponent size={32} />
                                    </div>
                                    <h3 className="domain-title">{domain.title}</h3>
                                    <p className="domain-desc">{domain.description}</p>
                                    <span className="domain-link">
                                        Explore Courses <Icons.ArrowRight size={18} />
                                    </span>
                                </Link>
                            </motion.article>
                        )
                    })}
                </motion.div>
            </section>

            {/* Developer Details Section */}
            <section className="developer-section" id="contact">
                <div className="section-header" style={{ marginBottom: '3rem' }}>
                    <h2>Meet the Developers</h2>
                    <p>The team behind PrepMaster</p>
                </div>

                <div className="dev-cards-grid">
                    <motion.div
                        className="dev-container"
                        initial={{ opacity: 0, y: 50 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 0.8, type: "spring" }}
                    >
                        <div className="dev-avatar-wrapper">
                            <img src="/avatar.png" alt="Daksh Hadvani 3D Avatar" className="dev-avatar" />
                            <div className="dev-glow"></div>
                        </div>

                        <div className="dev-info">
                            <div className="dev-badge">Developer</div>
                            <h2 className="dev-name">Daksh Hadvani</h2>
                            <h3 className="dev-studies">Diploma in Computer Engineering</h3>

                            <div className="dev-passion">
                                <motion.button
                                    onClick={() => {
                                        const newState = !liked;
                                        setLiked(newState);
                                        localStorage.setItem('dev_liked', JSON.stringify(newState));
                                    }}
                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                    whileTap={{ scale: 0.9, rotate: -5 }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem'
                                    }}
                                >
                                    <motion.div
                                        animate={{
                                            scale: liked ? [1, 1.4, 1.2] : 1,
                                            rotateY: liked ? [0, 180, 360] : 0
                                        }}
                                        transition={{ type: "spring", duration: 0.6 }}
                                        style={{ display: 'flex' }}
                                    >
                                        <Icons.Heart
                                            size={22}
                                            fill={liked ? "#ec4899" : "transparent"}
                                            color={liked ? "#ec4899" : "var(--text-tertiary)"}
                                            style={{ filter: liked ? 'drop-shadow(0 0 10px rgba(236, 72, 153, 0.5))' : 'none', transition: 'all 0.3s ease' }}
                                        />
                                    </motion.div>
                                </motion.button>
                                <p><strong>Passions:</strong> Problem Solving.<br></br>Making positive impact on people's lives through software.</p>
                            </div>

                            <div className="dev-links">
                                <a href="https://mail.google.com/mail/?view=cm&fs=1&to=daksh.hadvani132235@marwadiuniversity.ac.in" target="_blank" rel="noopener noreferrer" className="dev-link-btn email-btn">
                                    <Icons.Mail size={20} /> Email Me
                                </a>
                                <a href="https://github.com/dakshhadvani19" target="_blank" rel="noopener noreferrer" className="dev-link-btn github-btn">
                                    <Icons.Github size={20} /> GitHub
                                </a>
                                <a href="https://www.linkedin.com/in/daksh-hadvanii-b14176339?utm_source=share_via&utm_content=profile&utm_medium=member_android" target="_blank" rel="noopener noreferrer" className="dev-link-btn linkedin-btn">
                                    <Icons.Linkedin size={20} /> LinkedIn
                                </a>
                                <a href="https://instagram.com/dakshhh.__.19" target="_blank" rel="noopener noreferrer" className="dev-link-btn insta-btn">
                                    <Icons.Instagram size={20} /> Instagram
                                </a>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        className="dev-container"
                        initial={{ opacity: 0, y: 50 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 0.8, type: "spring", delay: 0.2 }}
                    >
                        <div className="dev-avatar-wrapper">
                            <img src="/avatar2.jpg" alt="Dev Kalola Avatar" className="dev-avatar" />
                            <div className="dev-glow"></div>
                        </div>

                        <div className="dev-info">
                            <div className="dev-badge">Developer</div>
                            <h2 className="dev-name">Dev Kalola</h2>
                            <h3 className="dev-studies">Diploma in Computer Engineering</h3>

                            <div className="dev-passion">
                                <motion.button
                                    onClick={() => {
                                        const newState = !liked2;
                                        setLiked2(newState);
                                        localStorage.setItem('dev_liked_2', JSON.stringify(newState));
                                    }}
                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                    whileTap={{ scale: 0.9, rotate: -5 }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem'
                                    }}
                                >
                                    <motion.div
                                        animate={{
                                            scale: liked2 ? [1, 1.4, 1.2] : 1,
                                            rotateY: liked2 ? [0, 180, 360] : 0
                                        }}
                                        transition={{ type: "spring", duration: 0.6 }}
                                        style={{ display: 'flex' }}
                                    >
                                        <Icons.Heart
                                            size={22}
                                            fill={liked2 ? "#ec4899" : "transparent"}
                                            color={liked2 ? "#ec4899" : "var(--text-tertiary)"}
                                            style={{ filter: liked2 ? 'drop-shadow(0 0 10px rgba(236, 72, 153, 0.5))' : 'none', transition: 'all 0.3s ease' }}
                                        />
                                    </motion.div>
                                </motion.button>
                                <p><strong>Passions:</strong> Building innovative solutions.<br></br>Turning ideas into impactful digital experiences.</p>
                            </div>

                            <div className="dev-links">
                                <a href="https://mail.google.com/mail/?view=cm&fs=1&to=dev.kalola132220@marwadiuniversity.ac.in" target="_blank" rel="noopener noreferrer" className="dev-link-btn email-btn">
                                    <Icons.Mail size={20} /> Email Me
                                </a>
                                <a href="https://github.com/devkalola" target="_blank" rel="noopener noreferrer" className="dev-link-btn github-btn">
                                    <Icons.Github size={20} /> GitHub
                                </a>
                                <a href="https://www.linkedin.com/in/dev-kalola-646442380/" target="_blank" rel="noopener noreferrer" className="dev-link-btn linkedin-btn">
                                    <Icons.Linkedin size={20} /> LinkedIn
                                </a>
                                <a href="https://www.instagram.com/kalola_dev_14/" target="_blank" rel="noopener noreferrer" className="dev-link-btn insta-btn">
                                    <Icons.Instagram size={20} /> Instagram
                                </a>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>
        </main >
    );
}
