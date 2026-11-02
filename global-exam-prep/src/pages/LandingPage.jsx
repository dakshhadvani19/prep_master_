import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ArrowDown, ArrowUpRight, Check, Github, Heart, Instagram,
    Linkedin, Mail,
} from 'lucide-react';
import { CATALOG_DOMAINS as domains } from '../data/catalogDomains';
import './LandingPage.css';

const MotionLink = motion(Link);
const smoothEase = [0.22, 1, 0.36, 1];

const heroSequence = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.06 } },
};
const heroReveal = {
    hidden: { opacity: 0, y: 18, filter: 'blur(8px)' },
    visible: {
        opacity: 1, y: 0, filter: 'blur(0px)',
        transition: { duration: 0.82, ease: smoothEase },
    },
};
const titleLine = {
    hidden: { y: '112%', opacity: 0, filter: 'blur(9px)' },
    visible: {
        y: '0%', opacity: 1, filter: 'blur(0px)',
        transition: { duration: 0.95, ease: smoothEase },
    },
};
const cardSequence = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.075, delayChildren: 0.04 } },
};
const cardReveal = {
    hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
    visible: {
        opacity: 1, y: 0, filter: 'blur(0px)',
        transition: { duration: 0.65, ease: smoothEase },
    },
};

function readSavedLike(key) {
    try {
        return JSON.parse(window.localStorage.getItem(key) || 'false') === true;
    } catch {
        return false;
    }
}

function StudyDeskArtwork() {
    return (
        <svg className="pm-home-artwork" viewBox="0 0 650 500" role="img" aria-label="Exam paper, answer sheet and pencil arranged on a study desk">
            <defs>
                <pattern id="pm-paper-grid" width="18" height="18" patternUnits="userSpaceOnUse">
                    <path d="M18 0H0V18" fill="none" stroke="#ffffff" strokeOpacity=".045" />
                </pattern>
                <filter id="pm-paper-shadow" x="-30%" y="-30%" width="160%" height="170%">
                    <feDropShadow dx="0" dy="20" stdDeviation="18" floodColor="#000000" floodOpacity=".42" />
                </filter>
            </defs>
            <path d="M70 100C145 22 291 15 401 65s190 119 179 229-105 164-228 164S78 394 47 289 1 175 70 100Z" fill="url(#pm-paper-grid)" stroke="#ffffff" strokeOpacity=".08" />
            <circle cx="470" cy="104" r="78" fill="none" stroke="#ffb454" strokeOpacity=".22" />
            <circle cx="470" cy="104" r="58" fill="none" stroke="#ffb454" strokeOpacity=".6" strokeWidth="5" strokeDasharray="250 115" transform="rotate(-92 470 104)" />
            <g filter="url(#pm-paper-shadow)" transform="rotate(-5 280 250)">
                <rect x="116" y="74" width="322" height="390" rx="12" fill="#20242b" stroke="#666b72" />
                <rect x="133" y="92" width="288" height="354" rx="5" fill="#f0ede5" />
                <path d="M133 92h288v62H133z" fill="#e5dfd2" />
                <text x="156" y="119" fill="#57534c" fontSize="10" fontFamily="Arial" letterSpacing="1.4">PREPMASTER / PRACTICE PAPER</text>
                <text x="156" y="140" fill="#17191d" fontSize="16" fontWeight="700" fontFamily="Arial">Examination practice</text>
                <rect x="156" y="174" width="175" height="5" rx="2.5" fill="#a9a39a" />
                <rect x="156" y="188" width="228" height="4" rx="2" fill="#d0cbc2" />
                <rect x="156" y="201" width="204" height="4" rx="2" fill="#d0cbc2" />
                <text x="156" y="239" fill="#393a3a" fontSize="10" fontWeight="700" fontFamily="Arial">01 / Explain the core concept.</text>
                <rect x="156" y="250" width="225" height="3" rx="1.5" fill="#c9c4bb" />
                <rect x="156" y="260" width="195" height="3" rx="1.5" fill="#c9c4bb" />
                <text x="156" y="296" fill="#393a3a" fontSize="10" fontWeight="700" fontFamily="Arial">02 / Apply your understanding.</text>
                <rect x="156" y="307" width="224" height="3" rx="1.5" fill="#c9c4bb" />
                <rect x="156" y="317" width="190" height="3" rx="1.5" fill="#c9c4bb" />
                <rect x="156" y="350" width="110" height="50" rx="4" fill="#e8e1d4" stroke="#c8bdab" />
                <path d="M170 382l15-17 12 9 17-20 31 29" fill="none" stroke="#b17b39" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="284" y="355" width="96" height="4" rx="2" fill="#c1baae" />
                <rect x="284" y="367" width="76" height="4" rx="2" fill="#c1baae" />
                <rect x="284" y="379" width="86" height="4" rx="2" fill="#c1baae" />
            </g>
            <g filter="url(#pm-paper-shadow)" transform="rotate(8 475 306)">
                <rect x="407" y="201" width="165" height="220" rx="10" fill="#292e35" stroke="#72767a" />
                <rect x="419" y="214" width="141" height="194" rx="5" fill="#f7f4ec" />
                <text x="433" y="239" fill="#5c564d" fontSize="9" fontFamily="Arial" fontWeight="700">ANSWER SHEET</text>
                <path d="M433 255h110" stroke="#d5cec2" />
                <g fill="none" stroke="#b4aa99" strokeWidth="1.5">
                    <circle cx="440" cy="277" r="5" /><circle cx="457" cy="277" r="5" /><circle cx="474" cy="277" r="5" />
                    <circle cx="440" cy="295" r="5" /><circle cx="457" cy="295" r="5" /><circle cx="474" cy="295" r="5" />
                    <circle cx="440" cy="313" r="5" /><circle cx="457" cy="313" r="5" /><circle cx="474" cy="313" r="5" />
                </g>
                <g stroke="#bd873f" strokeWidth="2.3" strokeLinecap="round"><path d="M436 277l3 3 6-7M453 295l3 3 6-7M470 313l3 3 6-7" /></g>
                <rect x="433" y="340" width="111" height="4" rx="2" fill="#d2cbbf" />
                <rect x="433" y="352" width="91" height="4" rx="2" fill="#d2cbbf" />
                <rect x="433" y="364" width="101" height="4" rx="2" fill="#d2cbbf" />
                <path d="M433 384l8 8 16-18" fill="none" stroke="#a9793a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <g transform="rotate(35 523 430)" filter="url(#pm-paper-shadow)">
                <rect x="511" y="342" width="17" height="126" rx="5" fill="#c18a46" />
                <path d="M511 351h17M511 454h17" stroke="#f3c987" strokeWidth="2" />
                <path d="M511 468l8.5 18 8.5-18Z" fill="#d8c1a0" />
                <path d="M517 480l2.5 6 2.5-6Z" fill="#35302a" />
            </g>
            <g fill="#ffb454"><circle cx="100" cy="367" r="4" /><circle cx="555" cy="162" r="3" /></g>
            <path d="M85 390l16-16M85 374l16 16" stroke="#ffb454" strokeOpacity=".65" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

function DomainArtwork({ id }) {
    const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
    return (
        <svg className="pm-domain-art" viewBox="0 0 180 120" aria-hidden="true">
            {id === 'engineering' && <g {...common}><path d="M12 60h36l15-15h31l13 13h61M48 60v31h22M94 45V18h24M120 58v35h42" /><rect x="60" y="34" width="33" height="29" rx="4" /><rect x="106" y="8" width="36" height="22" rx="3" /><rect x="116" y="82" width="30" height="23" rx="3" /><circle cx="48" cy="60" r="4" /><circle cx="120" cy="58" r="4" /><path d="M70 43v10m-5-5h10M125 19h18M125 24h11" /></g>}
            {id === 'computer-apps' && <g {...common}><rect x="15" y="12" width="110" height="72" rx="5" /><path d="M15 25h110M52 84v11m37-11v11M42 95h57M46 42l-9 9 9 9m21-18 9 9-9 9m18-1 7-16M137 37h28m-28 10h28m-28 10h28M142 29v39" /><circle cx="22" cy="19" r="2" /><circle cx="30" cy="19" r="2" /></g>}
            {id === 'management' && <g {...common}><path d="M15 99h151M25 99V19h128v80M43 78V57h17v21M75 78V40h17v38M107 78V28h17v50M35 43l27-13 24 7 36-20 20 8M131 25l11 0-2-10M45 88h83" /></g>}
            {id === 'science-pharmacy' && <g {...common}><path d="M69 13h39m-30 0v28L49 91q-4 8 7 8h66q11 0 7-9l-29-49V13M59 78h77M69 69q20-12 40 0 10 6 20 0" /><circle cx="44" cy="29" r="8" /><circle cx="24" cy="57" r="5" /><circle cx="49" cy="79" r="5" /><path d="M44 37l-17 16m23 4 2 17" /></g>}
            {id === 'law-arts' && <g {...common}><path d="M90 22v75M33 37h114M90 22l-10 10h20Z M47 37 29 73h36L47 37Zm86 0-18 36h36l-18-36Z M29 73q18 17 36 0m50 0q18 17 36 0M69 99h42M52 16q38-13 76 0v10q-38-13-76 0Z" /></g>}
            {id === 'diploma' && <g {...common}><path d="M19 89h143M35 89V28h110v61M47 40h86M47 52h59M47 64h72M31 19h118M41 14v10m13-10v6m13-6v10m13-10v6m13-6v10m13-10v6m13-6v10m13-10v6m13-6v10m13-10v6" /><circle cx="128" cy="65" r="18" /><path d="M128 50v30m-15-15h30M118 83l-5 17 15-7 15 7-5-17" /></g>}
        </svg>
    );
}

function DeveloperCard({ name, avatar, passion, email, github, linkedin, instagram, liked, onLike }) {
    return (
        <article className="pm-people-card">
            <div className="pm-people-identity">
                <img src={avatar} alt={name} className="pm-people-avatar" loading="lazy" />
                <div>
                    <p className="pm-people-role">The people behind PrepMaster</p>
                    <h3>{name}</h3>
                    <p className="pm-people-study">Diploma in Computer Engineering</p>
                </div>
                <motion.button
                    className="pm-people-like"
                    type="button"
                    aria-label={liked ? 'Remove appreciation' : 'Appreciate developer'}
                    aria-pressed={liked}
                    onClick={onLike}
                    whileTap={{ scale: 0.9 }}
                    transition={{ duration: 0.18, ease: smoothEase }}
                >
                    <Heart size={19} fill={liked ? 'currentColor' : 'none'} />
                </motion.button>
            </div>
            <p className="pm-people-passion">{passion}</p>
            <div className="pm-people-links">
                <a href={email} target="_blank" rel="noopener noreferrer" aria-label={'Email ' + name}><Mail size={17} /><span>Email</span></a>
                <a href={github} target="_blank" rel="noopener noreferrer" aria-label={name + ' on GitHub'}><Github size={17} /><span>GitHub</span></a>
                <a href={linkedin} target="_blank" rel="noopener noreferrer" aria-label={name + ' on LinkedIn'}><Linkedin size={17} /><span>LinkedIn</span></a>
                <a href={instagram} target="_blank" rel="noopener noreferrer" aria-label={name + ' on Instagram'}><Instagram size={17} /><span>Instagram</span></a>
            </div>
        </article>
    );
}

export default function LandingPage() {
    const location = useLocation();
    const reduceMotion = useReducedMotion();
    const [liked, setLiked] = useState(() => readSavedLike('dev_liked'));
    const [liked2, setLiked2] = useState(() => readSavedLike('dev_liked_2'));

    useEffect(() => {
        document.title = 'PrepMaster | University Exam Preparation';
        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.name = 'description';
            document.head.appendChild(metaDescription);
        }
        metaDescription.content = 'Explore academic programs, courses, semesters and syllabus-led examination practice with PrepMaster.';
    }, []);

    useEffect(() => {
        if (location.state?.scrollToContact) {
            document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState({}, '', location.pathname);
        }
    }, [location.pathname, location.state]);

    const updateLike = (key, setter, value) => {
        setter(value);
        try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional preference */ }
    };

    return (
        <main className="pm-home-refresh">
            <div className="pm-home-shell">
                <motion.section
                    className="pm-home-hero"
                    aria-labelledby="pm-home-title"
                    variants={heroSequence}
                    initial={reduceMotion ? false : 'hidden'}
                    animate="visible"
                >
                    <motion.div className="pm-home-copy" variants={heroSequence}>
                        <motion.p className="pm-home-kicker" variants={heroReveal}>A clearer way to prepare</motion.p>
                        <h1 id="pm-home-title" className="pm-home-title" aria-label="Make every study session count.">
                            <span className="pm-title-line"><motion.span variants={titleLine} aria-hidden="true">Make every study session</motion.span></span>
                            <span className="pm-title-line pm-title-line--accent"><motion.span variants={titleLine} aria-hidden="true">count.</motion.span></span>
                        </h1>
                        <motion.p className="pm-home-description" variants={heroReveal}>
                            Find your academic program, move through your semester and practise with exams shaped around your subject syllabus. Your next focused session starts here.
                        </motion.p>
                        <motion.div className="pm-home-actions" variants={heroReveal}>
                            <motion.a
                                className="pm-home-primary"
                                href="#programs"
                                whileHover={reduceMotion ? undefined : { y: -2, scale: 1.015 }}
                                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                                transition={{ duration: 0.24, ease: smoothEase }}
                            >
                                Explore academic programs <ArrowDown size={17} />
                            </motion.a>
                            <MotionLink
                                className="pm-home-secondary"
                                to="/test-rooms"
                                whileHover={reduceMotion ? undefined : { y: -2 }}
                                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                                transition={{ duration: 0.24, ease: smoothEase }}
                            >
                                Join a test room <ArrowUpRight size={16} />
                            </MotionLink>
                        </motion.div>
                        <motion.div className="pm-home-proof" aria-label="How PrepMaster is organised" variants={heroReveal}>
                            <span><Check size={15} /> 6 academic domains</span>
                            <span><Check size={15} /> Course-led catalog</span>
                            <span><Check size={15} /> Syllabus-based practice</span>
                        </motion.div>
                    </motion.div>
                    <motion.div
                        className="pm-home-art-wrap"
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.97, filter: 'blur(5px)' }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)', y: [0, -7, 0] }}
                        transition={reduceMotion ? { duration: 0 } : { opacity: { duration: 0.9, ease: smoothEase }, scale: { duration: 1, ease: smoothEase }, filter: { duration: 0.9 }, y: { duration: 9, repeat: Infinity, ease: 'easeInOut' } }}
                    >
                        <StudyDeskArtwork />
                    </motion.div>
                </motion.section>
            </div>
            <div className="pm-home-rule" />
            <section id="programs" className="pm-programs">
                <div className="pm-home-shell">
                    <motion.div
                        className="pm-section-head"
                        initial={reduceMotion ? false : { opacity: 0, y: 14, filter: 'blur(5px)' }}
                        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ duration: 0.75, ease: smoothEase }}
                    >
                        <h2>Select Your Academic <span>Domain</span></h2>
                        <p>Start with your field of study. We’ll take you from program to semester and then to the subject you want to practise.</p>
                    </motion.div>
                    <motion.div
                        className="pm-domain-grid"
                        variants={cardSequence}
                        initial={reduceMotion ? false : 'hidden'}
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.12 }}
                    >
                        {domains.map((domain) => (
                            <MotionLink
                                key={domain.id}
                                to={'/domains/' + domain.id + '/courses'}
                                className="pm-domain-card"
                                variants={cardReveal}
                                whileHover={reduceMotion ? undefined : { y: -5, scale: 1.008 }}
                                whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                                transition={{ duration: 0.32, ease: smoothEase }}
                            >
                                <div className="pm-domain-art-wrap"><DomainArtwork id={domain.id} /></div>
                                <div className="pm-domain-content">
                                    <h3>{domain.title}</h3>
                                    <p>{domain.description}</p>
                                    <span className="pm-domain-open">Explore programs <ArrowUpRight size={15} /></span>
                                </div>
                            </MotionLink>
                        ))}
                    </motion.div>
                </div>
            </section>
            <section id="contact" className="pm-people-section">
                <div className="pm-home-shell">
                    <motion.div
                        className="pm-people-head"
                        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ duration: 0.7, ease: smoothEase }}
                    >
                        <div><h2>Meet the people behind PrepMaster</h2><p>A small team building tools to make exam preparation more focused.</p></div>
                    </motion.div>
                    <motion.div
                        className="pm-people-grid"
                        initial={reduceMotion ? false : 'hidden'}
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.12 }}
                        variants={cardSequence}
                    >
                        <motion.div variants={cardReveal}>
                            <DeveloperCard
                                name="Daksh Hadvani" avatar="/avatar.png"
                                passion="Problem solving, and building software that can make a positive impact on people’s lives."
                                email="https://mail.google.com/mail/?view=cm&fs=1&to=daksh.hadvani132235@marwadiuniversity.ac.in"
                                github="https://github.com/dakshhadvani19"
                                linkedin="https://www.linkedin.com/in/daksh-hadvanii-b14176339?utm_source=share_via&utm_content=profile&utm_medium=member_android"
                                instagram="https://instagram.com/dakshhh.__.19"
                                liked={liked} onLike={() => updateLike('dev_liked', setLiked, !liked)}
                            />
                        </motion.div>
                        <motion.div variants={cardReveal}>
                            <DeveloperCard
                                name="Dev Kalola" avatar="/avatar2.jpg"
                                passion="Building innovative solutions and turning ideas into impactful digital experiences."
                                email="https://mail.google.com/mail/?view=cm&fs=1&to=dev.kalola132220@marwadiuniversity.ac.in"
                                github="https://github.com/devkalola"
                                linkedin="https://www.linkedin.com/in/dev-kalola-646442380/"
                                instagram="https://www.instagram.com/kalola_dev_14/"
                                liked={liked2} onLike={() => updateLike('dev_liked_2', setLiked2, !liked2)}
                            />
                        </motion.div>
                    </motion.div>
                </div>
            </section>
        </main>
    );
}
