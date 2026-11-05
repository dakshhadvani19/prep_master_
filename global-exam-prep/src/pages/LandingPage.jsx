import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ArrowDown, ArrowUpRight, Check, Github, Heart, Instagram,
    Linkedin, Mail,
} from 'lucide-react';
import { CATALOG_DOMAINS as domains } from '../data/catalogDomains';
import './LandingPage.css';

const smoothEase = [0.22, 1, 0.36, 1];

const cardSequence = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.075, delayChildren: 0.04 } },
};
const cardReveal = {
    hidden: { opacity: 0, y: 14 },
    visible: {
        opacity: 1, y: 0,
        transition: { duration: 0.52, ease: smoothEase },
    },
};

const heroSequence = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.09, delayChildren: 0.06 } },
};
const heroReveal = {
    hidden: { opacity: 0, y: 14 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.48, ease: smoothEase },
    },
};

const StudyDeskArtwork = React.memo(function StudyDeskArtwork() {
    return (
        <svg className="pm-home-artwork" viewBox="0 0 650 500" role="img" aria-label="Exam paper, answer sheet and pencil arranged on a study desk">
            <defs>
                <pattern id="pm-paper-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                    <path d="M48 0H0V48" fill="none" stroke="#ffffff" strokeOpacity=".045" />
                </pattern>
                <filter id="pm-paper-shadow" x="-18%" y="-18%" width="136%" height="142%">
                    <feDropShadow dx="0" dy="9" stdDeviation="6" floodColor="#000000" floodOpacity=".24" />
                </filter>
            </defs>
            <path d="M70 100C145 22 291 15 401 65s190 119 179 229-105 164-228 164S78 394 47 289 1 175 70 100Z" fill="url(#pm-paper-grid)" stroke="#ffffff" strokeOpacity=".08" />
            <circle cx="470" cy="104" r="78" fill="none" stroke="#ffc06a" strokeOpacity=".22" />
            <circle cx="470" cy="104" r="58" fill="none" stroke="#ffc06a" strokeOpacity=".6" strokeWidth="5" strokeDasharray="250 115" transform="rotate(-92 470 104)" />
            <g filter="url(#pm-paper-shadow)" transform="rotate(-5 280 250)">
                <rect x="116" y="74" width="322" height="390" rx="12" fill="#20242b" stroke="#aeb5bf" />
                <rect x="133" y="92" width="288" height="354" rx="5" fill="#ffffff" />
                <path d="M133 92h288v62H133z" fill="#f1f3f6" />
                <text x="156" y="119" fill="#555d68" fontSize="10" fontFamily="Arial" letterSpacing="1.4">PREPMASTER / PRACTICE PAPER</text>
                <text x="156" y="140" fill="#17191d" fontSize="16" fontWeight="700" fontFamily="Arial">Examination practice</text>
                <rect x="156" y="174" width="175" height="5" rx="2.5" fill="#b9c0c9" />
                <rect x="156" y="188" width="228" height="4" rx="2" fill="#cbd1d9" />
                <rect x="156" y="201" width="204" height="4" rx="2" fill="#cbd1d9" />
                <text x="156" y="239" fill="#333a44" fontSize="10" fontWeight="700" fontFamily="Arial">01 / Explain the core concept.</text>
                <rect x="156" y="250" width="225" height="3" rx="1.5" fill="#c8ced7" />
                <rect x="156" y="260" width="195" height="3" rx="1.5" fill="#c8ced7" />
                <text x="156" y="296" fill="#333a44" fontSize="10" fontWeight="700" fontFamily="Arial">02 / Apply your understanding.</text>
                <rect x="156" y="307" width="224" height="3" rx="1.5" fill="#c8ced7" />
                <rect x="156" y="317" width="190" height="3" rx="1.5" fill="#c8ced7" />
                <rect x="156" y="350" width="110" height="50" rx="4" fill="#f6f7f9" stroke="#d0d5dc" />
                <path d="M170 382l15-17 12 9 17-20 31 29" fill="none" stroke="#b17b39" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="284" y="355" width="96" height="4" rx="2" fill="#c5ccd5" />
                <rect x="284" y="367" width="76" height="4" rx="2" fill="#c5ccd5" />
                <rect x="284" y="379" width="86" height="4" rx="2" fill="#c5ccd5" />
            </g>
            <g filter="url(#pm-paper-shadow)" transform="rotate(8 475 306)">
                <rect x="407" y="201" width="165" height="220" rx="10" fill="#292e35" stroke="#aeb5bf" />
                <rect x="419" y="214" width="141" height="194" rx="5" fill="#ffffff" />
                <text x="433" y="239" fill="#555d68" fontSize="9" fontFamily="Arial" fontWeight="700">ANSWER SHEET</text>
                <path d="M433 255h110" stroke="#d1d7df" />
                <g fill="none" stroke="#bfc6d0" strokeWidth="1.5">
                    <circle cx="440" cy="277" r="5" /><circle cx="457" cy="277" r="5" /><circle cx="474" cy="277" r="5" />
                    <circle cx="440" cy="295" r="5" /><circle cx="457" cy="295" r="5" /><circle cx="474" cy="295" r="5" />
                    <circle cx="440" cy="313" r="5" /><circle cx="457" cy="313" r="5" /><circle cx="474" cy="313" r="5" />
                </g>
                <g stroke="#d99c4a" strokeWidth="2.3" strokeLinecap="round"><path d="M436 277l3 3 6-7M453 295l3 3 6-7M470 313l3 3 6-7" /></g>
                <rect x="433" y="340" width="111" height="4" rx="2" fill="#c8ced7" />
                <rect x="433" y="352" width="91" height="4" rx="2" fill="#c8ced7" />
                <rect x="433" y="364" width="101" height="4" rx="2" fill="#c8ced7" />
                <path d="M433 384l8 8 16-18" fill="none" stroke="#d99c4a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <g transform="rotate(35 523 430)" filter="url(#pm-paper-shadow)">
                <rect x="511" y="342" width="17" height="126" rx="5" fill="#f7f8fa" stroke="#d99c4a" strokeWidth="1.4" />
                <path d="M511 351h17M511 454h17" stroke="#d99c4a" strokeWidth="2" />
                <path d="M511 468l8.5 18 8.5-18Z" fill="#f0f2f5" />
                <path d="M517 480l2.5 6 2.5-6Z" fill="#35302a" />
            </g>
            <g fill="#ffc06a"><circle cx="100" cy="367" r="4" /><circle cx="555" cy="162" r="3" /></g>
            <path d="M85 390l16-16M85 374l16 16" stroke="#ffc06a" strokeOpacity=".65" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
});

const DomainArtwork = React.memo(function DomainArtwork({ id }) {
    const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
    return (
        <svg className="pm-domain-art" viewBox="0 0 180 120" aria-hidden="true">
            {id === 'engineering' && <g {...common}><path d="M12 60h36l15-15h31l13 13h61M48 60v31h22M94 45V18h24M120 58v35h42" /><rect x="60" y="34" width="33" height="29" rx="4" /><rect x="106" y="8" width="36" height="22" rx="3" /><rect x="116" y="82" width="30" height="23" rx="3" /><circle cx="48" cy="60" r="4" /><circle cx="120" cy="58" r="4" /><path className="pm-domain-art__accent" d="M70 43v10m-5-5h10" /><path d="M125 19h18M125 24h11" /></g>}
            {id === 'computer-apps' && <g {...common}><rect x="15" y="12" width="110" height="72" rx="5" /><path d="M15 25h110M52 84v11m37-11v11M42 95h57" /><path className="pm-domain-art__accent" d="M46 42l-9 9 9 9m21-18 9 9-9 9" /><path d="M91 50l7-16M137 37h28m-28 10h28m-28 10h28M142 29v39" /><circle cx="22" cy="19" r="2" /><circle cx="30" cy="19" r="2" /></g>}
            {id === 'management' && <g {...common}><path d="M15 99h151M25 99V19h128v80M43 78V57h17v21M75 78V40h17v38M107 78V28h17v50M131 25l11 0-2-10M45 88h83" /><path className="pm-domain-art__accent" d="M35 43l27-13 24 7 36-20 20 8" /></g>}
            {id === 'science-pharmacy' && <g {...common}><path d="M69 13h39m-30 0v28L49 91q-4 8 7 8h66q11 0 7-9l-29-49V13M59 78h77" /><path className="pm-domain-art__accent" d="M69 69q20-12 40 0 10 6 20 0" /><circle cx="44" cy="29" r="8" /><circle cx="24" cy="57" r="5" /><circle cx="49" cy="79" r="5" /><path d="M44 37l-17 16m23 4 2 17" /></g>}
            {id === 'law-arts' && <g {...common}><path d="M90 22v75M33 37h114M47 37 29 73h36L47 37Zm86 0-18 36h36l-18-36Z M29 73q18 17 36 0m50 0q18 17 36 0M69 99h42M52 16q38-13 76 0v10q-38-13-76 0Z" /><path className="pm-domain-art__accent" d="M90 22l-10 10h20Z" /></g>}
            {id === 'diploma' && <g {...common}><path d="M19 89h143M35 89V28h110v61M47 40h86M47 52h59M47 64h72M31 19h118M41 14v10m13-10v6m13-6v10m13-10v6m13-6v10m13-10v6m13-6v10m13-10v6m13-6v10m13-10v6" /><circle cx="128" cy="65" r="18" /><path className="pm-domain-art__accent" d="M128 50v30m-15-15h30" /><path d="M118 83l-5 17 15-7 15 7-5-17" /></g>}
        </svg>
    );
});

const DeveloperCard = React.memo(function DeveloperCard({ name, avatar, passion, email, github, linkedin, instagram, preferenceKey }) {
    const [liked, setLiked] = React.useState(() => readLikePreference(preferenceKey));
    const handleLike = React.useCallback(() => {
        setLiked((current) => {
            const next = !current;
            try {
                window.localStorage.setItem(preferenceKey, JSON.stringify(next));
            } catch {
                // Appreciation still works when browser storage is unavailable.
            }
            return next;
        });
    }, [preferenceKey]);

    return (
        <article className="pm-people-card">
            <div className="pm-people-identity">
                <img src={avatar} alt={name} className="pm-people-avatar" loading="lazy" decoding="async" fetchPriority="low" />
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
                    onClick={handleLike}
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
});

const MotionLink = motion(Link);

function readLikePreference(key) {
    try {
        return JSON.parse(window.localStorage.getItem(key) || 'false') === true;
    } catch {
        return false;
    }
}

export default function LandingPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const reduceMotion = useReducedMotion();

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
        if (!location.state?.scrollToContact) return;
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState({}, '', location.pathname);
    }, [location.pathname, location.state]);

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
                        <motion.p className="pm-home-kicker" variants={heroReveal}>
                            A clearer way to prepare
                        </motion.p>
                        <motion.h1 id="pm-home-title" className="pm-home-title" variants={heroReveal}>
                            Make every study session count.
                        </motion.h1>
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
                                Explore Programs <ArrowDown size={17} />
                            </motion.a>
                            <motion.button
                                className="pm-home-secondary"
                                type="button"
                                onClick={() => navigate('/test-rooms')}
                                whileHover={reduceMotion ? undefined : { y: -2 }}
                                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                                transition={{ duration: 0.24, ease: smoothEase }}
                            >
                                Join Test Room <ArrowUpRight size={16} />
                            </motion.button>
                        </motion.div>
                        <motion.div className="pm-home-proof" aria-label="How PrepMaster is organised" variants={heroReveal}>
                            <span><Check size={15} /> 6 academic domains</span>
                            <span><Check size={15} /> Course-led catalog</span>
                            <span><Check size={15} /> Syllabus-based practice</span>
                        </motion.div>
                    </motion.div>
                    <div className="pm-home-art-wrap" aria-hidden="true">
                        <StudyDeskArtwork />
                    </div>
                </motion.section>
            </div>

            <div className="pm-home-rule" />

            <section id="programs" className="pm-programs">
                <div className="pm-home-shell">
                    <motion.div
                        className="pm-section-head"
                        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ duration: 0.65, ease: smoothEase }}
                    >
                        <h2>Select Your Academic Domain</h2>
                        <p>Choose your discipline below to browse its courses and start preparing for your examinations.</p>
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
                                className="domain-card pm-domain-card"
                                variants={cardReveal}
                            >
                                <div className="pm-domain-art-wrap">
                                    <DomainArtwork id={domain.id} />
                                </div>
                                <div className="pm-domain-content">
                                    <h3>{domain.title}</h3>
                                    <p>{domain.description}</p>
                                    <span className="pm-domain-open">
                                        Explore Courses <ArrowUpRight size={16} />
                                    </span>
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
                                preferenceKey="dev_liked"
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
                                preferenceKey="dev_liked_2"
                            />
                        </motion.div>
                    </motion.div>
                </div>
            </section>
        </main>
    );
}
