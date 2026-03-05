import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import { domains } from '../data/mockData';
import * as Icons from 'lucide-react';
import './LandingPage.css';

export default function LandingPage() {
    const navigate = useNavigate();
    const controls = useAnimation();

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
                    <motion.div
                        className="hero-badge"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                    >
                        <Icons.Award size={16} /> Now Supporting Global Universities
                    </motion.div>

                    <motion.h1
                        className="hero-title"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.8 }}
                    >
                        Master Your University Exams <br />
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
                        <button className="btn-secondary" onClick={() => navigate('/signup')}>
                            Create Free Account
                        </button>
                    </motion.div>

                    <motion.div
                        className="stats-container"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2, duration: 1 }}
                    >
                        <div className="stat-item">
                            <div className="stat-number">6+</div>
                            <div className="stat-label">Global Faculties</div>
                        </div>
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
                        Choose your discipline below to instantly generate accurate engineering, medical, management, or arts exams.
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
                        <div className="dev-badge">Meet the Developer</div>
                        <h2 className="dev-name">Daksh Hadvani</h2>
                        <h3 className="dev-studies">Diploma in Computer Engineering</h3>

                        <div className="dev-passion">
                            <Icons.Heart size={18} className="passion-icon" />
                            <p><strong>Passion:</strong> Problem Solving, Making a positive impact on people's lives through software.</p>
                        </div>

                        <div className="dev-links">
                            <a href="https://mail.google.com/mail/?view=cm&fs=1&to=dakshpatel09765gy@gmail.com" target="_blank" rel="noopener noreferrer" className="dev-link-btn email-btn">
                                <Icons.Mail size={20} /> Email Me
                            </a>
                            <a href="https://github.com/dakshhadvani19" target="_blank" rel="noopener noreferrer" className="dev-link-btn github-btn">
                                <Icons.Github size={20} /> GitHub
                            </a>
                            <a href="https://www.linkedin.com/in/daksh-hadvaniib14176339?utm_source=share_via&utm_content=profile&utm_medium=member_android" target="_blank" rel="noopener noreferrer" className="dev-link-btn linkedin-btn">
                                <Icons.Linkedin size={20} /> LinkedIn
                            </a>
                            <a href="https://instagram.com/dakshhh.__.19" target="_blank" rel="noopener noreferrer" className="dev-link-btn insta-btn">
                                <Icons.Instagram size={20} /> dakshhh.__.19
                            </a>
                        </div>
                    </div>
                </motion.div>
            </section>
        </main >
    );
}
