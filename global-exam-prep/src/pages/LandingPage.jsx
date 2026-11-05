import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    ArrowDown, ArrowUpRight, Check, Github, Heart, Instagram,
    Linkedin, Mail,
} from 'lucide-react';
import { CATALOG_DOMAINS as domains } from '../data/catalogDomains';
import './LandingPage.css';

const StudyDeskArtwork = React.memo(function StudyDeskArtwork() {
    return (
        <svg className="pm-home-artwork" viewBox="0 0 640 480" role="img" aria-label="Writing pad and multiple-choice answer sheet">
            <g transform="rotate(-4 260 230)">
                <rect x="90" y="38" width="350" height="392" rx="12" fill="#20242b" stroke="#9aa4b3" strokeWidth="2" />
                <rect x="104" y="52" width="322" height="364" rx="5" fill="#ffffff" />
                <path d="M104 52H426V132H104Z" fill="#f0f2f6" />
                <text x="132" y="84" fill="#626b79" fontSize="10" fontFamily="Arial" letterSpacing="1.3">PREPMASTER / NOTES</text>
                <text x="132" y="113" fill="#171b24" fontSize="22" fontWeight="700" fontFamily="Arial">Writing pad</text>
                <path d="M132 139H398" stroke="#d9dee7" strokeWidth="2" />

                <text x="132" y="171" fill="#353d4b" fontSize="12" fontWeight="700" fontFamily="Arial">01 / Key concepts</text>
                <path d="M132 188H386M132 203H358M132 218H378" stroke="#c8ced8" strokeWidth="3" strokeLinecap="round" />

                <text x="132" y="257" fill="#353d4b" fontSize="12" fontWeight="700" fontFamily="Arial">02 / Practice notes</text>
                <path d="M132 274H386M132 289H365" stroke="#c8ced8" strokeWidth="3" strokeLinecap="round" />

                <rect x="132" y="316" width="116" height="72" rx="4" fill="#f5f6f9" stroke="#d3d9e2" />
                <path d="M145 375L163 354L181 364L199 340L232 373" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M275 329H389M275 345H373M275 361H389M275 377H352" stroke="#c8ced8" strokeWidth="3" strokeLinecap="round" />
            </g>

            <g transform="rotate(6 470 300)">
                <rect x="378" y="176" width="188" height="250" rx="10" fill="#292e35" stroke="#9aa4b3" strokeWidth="2" />
                <rect x="391" y="189" width="162" height="224" rx="5" fill="#ffffff" />
                <text x="407" y="218" fill="#343b47" fontSize="11" fontWeight="700" fontFamily="Arial" letterSpacing=".5">ANSWER SHEET</text>
                <path d="M407 231H537" stroke="#d4dae3" strokeWidth="1.5" />
                <text x="407" y="250" fill="#707989" fontSize="7.5" fontFamily="Arial" letterSpacing=".4">MARK ONE OPTION</text>

                <g stroke="#aeb7c5" strokeWidth="1.6">
                    <circle cx="418" cy="270" r="6" fill="#8b5cf6" stroke="#8b5cf6" />
                    <circle cx="442" cy="270" r="6" fill="none" />
                    <circle cx="466" cy="270" r="6" fill="none" />
                    <circle cx="418" cy="296" r="6" fill="none" />
                    <circle cx="442" cy="296" r="6" fill="#8b5cf6" stroke="#8b5cf6" />
                    <circle cx="466" cy="296" r="6" fill="none" />
                    <circle cx="418" cy="322" r="6" fill="none" />
                    <circle cx="442" cy="322" r="6" fill="none" />
                    <circle cx="466" cy="322" r="6" fill="#8b5cf6" stroke="#8b5cf6" />
                </g>
                <path d="M487 270H532M487 296H532M487 322H532M407 351H537M407 364H522M407 377H532" stroke="#cbd1da" strokeWidth="3" strokeLinecap="round" />
            </g>
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
        const next = !liked;
        setLiked(next);
        try {
            window.localStorage.setItem(preferenceKey, JSON.stringify(next));
        } catch {
            // Appreciation still works when browser storage is unavailable.
        }
    }, [liked, preferenceKey]);

    return (
        <article className="pm-people-card">
            <div className="pm-people-identity">
                <img src={avatar} alt={name} className="pm-people-avatar" loading="lazy" decoding="async" fetchPriority="low" />
                <div>
                    <p className="pm-people-role">The people behind PrepMaster</p>
                    <h3>{name}</h3>
                    <p className="pm-people-study">Diploma in Computer Engineering</p>
                </div>
                <button
                    className="pm-people-like"
                    type="button"
                    aria-label={liked ? 'Remove appreciation' : 'Appreciate developer'}
                    aria-pressed={liked}
                    onClick={handleLike}
                >
                    <Heart size={19} fill={liked ? 'currentColor' : 'none'} />
                </button>
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
    const [domainArtworkReady, setDomainArtworkReady] = React.useState(false);

    useEffect(() => {
        document.body.classList.add('pm-home-body');
        document.title = 'PrepMaster | University Exam Preparation';
        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.name = 'description';
            document.head.appendChild(metaDescription);
        }
        metaDescription.content = 'Explore academic programs, courses, semesters and syllabus-led examination practice with PrepMaster.';
        return () => document.body.classList.remove('pm-home-body');
    }, []);

    useEffect(() => {
        if (!location.state?.scrollToContact) return;
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState({}, '', location.pathname);
    }, [location.pathname, location.state]);

    useEffect(() => {
        const root = document.querySelector('.pm-home-refresh');
        if (!root) return undefined;

        const revealTargets = root.querySelectorAll('[data-home-reveal]');
        const artworkGrid = root.querySelector('[data-home-domain-grid]');
        if (!revealTargets.length && !artworkGrid) return undefined;

        if (!('IntersectionObserver' in window)) {
            revealTargets.forEach((target) => target.classList.add('is-visible'));
            setDomainArtworkReady(true);
            return undefined;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                if (entry.target === artworkGrid) {
                    setDomainArtworkReady(true);
                } else {
                    entry.target.classList.add('is-visible');
                }
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '180px 0px 180px 0px', threshold: 0.02 });

        revealTargets.forEach((target) => observer.observe(target));
        if (artworkGrid) observer.observe(artworkGrid);
        return () => observer.disconnect();
    }, []);

    return (
        <main className="pm-home-refresh">
            <div className="pm-home-shell">
                <section className="pm-home-hero" aria-labelledby="pm-home-title">
                    <div className="pm-home-copy">
                        <p className="pm-home-kicker pm-home-reveal" data-home-reveal style={{ '--home-reveal-delay': '0ms' }}>
                            A clearer way to prepare
                        </p>
                        <h1 id="pm-home-title" className="pm-home-title pm-home-reveal" data-home-reveal style={{ '--home-reveal-delay': '70ms' }}>
                            Make every study session count.
                        </h1>
                        <p className="pm-home-description pm-home-reveal" data-home-reveal style={{ '--home-reveal-delay': '140ms' }}>
                            Find your academic program, move through your semester and practise with exams shaped around your subject syllabus. Your next focused session starts here.
                        </p>
                        <div className="pm-home-actions pm-home-reveal" data-home-reveal style={{ '--home-reveal-delay': '210ms' }}>
                            <a className="pm-home-primary" href="#programs">
                                Explore Programs <ArrowDown size={17} />
                            </a>
                            <button className="pm-home-secondary" type="button" onClick={() => navigate('/test-rooms')}>
                                Join Test Room <ArrowUpRight size={16} />
                            </button>
                        </div>
                        <div className="pm-home-proof pm-home-reveal" aria-label="How PrepMaster is organised" data-home-reveal style={{ '--home-reveal-delay': '280ms' }}>
                            <span><Check size={15} /> 6 academic domains</span>
                            <span><Check size={15} /> Course-led catalog</span>
                            <span><Check size={15} /> Syllabus-based practice</span>
                        </div>
                    </div>
                    <div className="pm-home-art-wrap" aria-hidden="true">
                        <StudyDeskArtwork />
                    </div>
                </section>
            </div>

            <div className="pm-home-rule" />

            <section id="programs" className="pm-programs">
                <div className="pm-home-shell">
                    <div className="pm-section-head pm-home-reveal" data-home-reveal>
                        <h2>Select Your Academic Domain</h2>
                        <p>Choose your discipline below to browse its courses and start preparing for your examinations.</p>
                    </div>

                    <div className="pm-domain-grid" data-home-domain-grid>
                        {domains.map((domain, index) => (
                            <Link
                                key={domain.id}
                                to={'/domains/' + domain.id + '/courses'}
                                className="domain-card pm-domain-card pm-home-reveal"
                                data-home-reveal
                                style={{ '--home-reveal-delay': (index * 55) + 'ms' }}
                            >
                                <div className="pm-domain-art-wrap">
                                    {domainArtworkReady
                                        ? <DomainArtwork id={domain.id} />
                                        : <span className="pm-domain-art-placeholder" aria-hidden="true" />}
                                </div>
                                <div className="pm-domain-content">
                                    <h3>{domain.title}</h3>
                                    <p>{domain.description}</p>
                                    <span className="pm-domain-open">
                                        Explore Courses <ArrowUpRight size={16} />
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <section id="contact" className="pm-people-section">
                <div className="pm-home-shell">
                    <div className="pm-people-head pm-home-reveal" data-home-reveal>
                        <div><h2>Meet the people behind PrepMaster</h2><p>A small team building tools to make exam preparation more focused.</p></div>
                    </div>
                    <div className="pm-people-grid">
                        <div className="pm-home-reveal" data-home-reveal style={{ '--home-reveal-delay': '0ms' }}>
                            <DeveloperCard
                                name="Daksh Hadvani" avatar="/avatar.png"
                                passion="Problem solving, and building software that can make a positive impact on people’s lives."
                                email="https://mail.google.com/mail/?view=cm&fs=1&to=daksh.hadvani132235@marwadiuniversity.ac.in"
                                github="https://github.com/dakshhadvani19"
                                linkedin="https://www.linkedin.com/in/daksh-hadvanii-b14176339?utm_source=share_via&utm_content=profile&utm_medium=member_android"
                                instagram="https://instagram.com/dakshhh.__.19"
                                preferenceKey="dev_liked"
                            />
                        </div>
                        <div className="pm-home-reveal" data-home-reveal style={{ '--home-reveal-delay': '70ms' }}>
                            <DeveloperCard
                                name="Dev Kalola" avatar="/avatar2.jpg"
                                passion="Building innovative solutions and turning ideas into impactful digital experiences."
                                email="https://mail.google.com/mail/?view=cm&fs=1&to=dev.kalola132220@marwadiuniversity.ac.in"
                                github="https://github.com/devkalola"
                                linkedin="https://www.linkedin.com/in/dev-kalola-646442380/"
                                instagram="https://www.instagram.com/kalola_dev_14/"
                                preferenceKey="dev_liked_2"
                            />
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
