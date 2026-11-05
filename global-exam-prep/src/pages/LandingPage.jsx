import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, useAnimation } from 'framer-motion';
import {
    ArrowDown, ArrowUpRight, Check, Github, Heart, Instagram,
    Linkedin, Mail,
} from 'lucide-react';
import { CATALOG_DOMAINS as domains } from '../data/catalogDomains';
import * as Icons from 'lucide-react';
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
}

function DomainArtwork({ id }) {
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

const LEGACY_HOME_STYLES = "/* ── Hero Section ────────────────────────────────────── */\n.hero-section {\n    position: relative;\n    min-height: 90vh;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    overflow: hidden;\n    padding: 6rem 2rem;\n}\n\n.hero-content {\n    position: relative;\n    z-index: 10;\n    text-align: center;\n    max-width: 900px;\n    margin: 0 auto;\n}\n\n.hero-badge {\n    display: inline-flex;\n    align-items: center;\n    gap: 0.5rem;\n    padding: 0.5rem 1.25rem;\n    background: rgba(59, 130, 246, 0.1);\n    border: 1px solid rgba(59, 130, 246, 0.2);\n    color: var(--accent-primary);\n    border-radius: var(--radius-full);\n    font-size: 0.875rem;\n    font-weight: 600;\n    margin-bottom: 2rem;\n    backdrop-filter: blur(10px);\n}\n\n.hero-title {\n    font-size: clamp(2.2rem, 7vw, 5rem);\n    line-height: 1.1;\n    letter-spacing: -0.03em;\n    margin-bottom: 1.5rem;\n    font-weight: 800;\n}\n\n.hero-description {\n    font-size: clamp(1rem, 2vw, 1.2rem);\n    color: var(--text-secondary);\n    max-width: 700px;\n    margin: 0 auto 3rem auto;\n    line-height: 1.6;\n    padding: 0 1rem;\n}\n\n.hero-actions {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 1.5rem;\n    flex-wrap: wrap;\n}\n\n.btn-primary {\n    background: var(--accent-gradient);\n    color: white;\n    padding: 1rem 2rem;\n    border-radius: var(--radius-full);\n    font-size: 1.05rem;\n    font-weight: 600;\n    display: flex;\n    align-items: center;\n    gap: 0.75rem;\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.5);\n}\n\n.btn-primary:hover {\n    transform: translateY(-3px) scale(1.02);\n    box-shadow: 0 20px 35px -5px rgba(59, 130, 246, 0.6);\n}\n\n.btn-secondary {\n    background: rgba(255, 255, 255, 0.05);\n    border: 1px solid rgba(255, 255, 255, 0.1);\n    color: var(--text-primary);\n    padding: 1rem 2rem;\n    border-radius: var(--radius-full);\n    font-size: 1.05rem;\n    font-weight: 600;\n    transition: all 0.3s ease;\n    backdrop-filter: blur(10px);\n}\n\n.btn-secondary:hover {\n    background: rgba(255, 255, 255, 0.1);\n    transform: translateY(-3px);\n}\n\n.btn-google-cta {\n    display: inline-flex;\n    align-items: center;\n    gap: 0.55rem;\n    background: rgba(255, 255, 255, 0.04);\n    border: 1px solid rgba(255, 255, 255, 0.12);\n    color: var(--text-primary);\n    padding: 0.85rem 1.75rem;\n    border-radius: var(--radius-full);\n    font-size: 0.95rem;\n    font-weight: 600;\n    transition: all 0.3s ease;\n    backdrop-filter: blur(10px);\n    cursor: pointer;\n    font-family: inherit;\n}\n\n.btn-google-cta:hover {\n    background: rgba(255, 255, 255, 0.09);\n    border-color: rgba(255, 255, 255, 0.2);\n    transform: translateY(-2px);\n}\n\n\n\n/* ── 3D Floating Elements ────────────────────────────── */\n.hero-shapes {\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    perspective: 1000px;\n    z-index: 0;\n    pointer-events: none;\n}\n\n.floating-element {\n    position: absolute;\n    border-radius: var(--radius-lg);\n    background: rgba(255, 255, 255, 0.03);\n    border: 1px solid rgba(255, 255, 255, 0.05);\n    backdrop-filter: blur(10px);\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);\n    transform-style: preserve-3d;\n}\n\n.el-1 {\n    top: 15%;\n    left: 4%;\n    width: 100px;\n    height: 100px;\n    animation: float3d 12s ease-in-out infinite;\n}\n\n.el-2 {\n    top: 60%;\n    left: 2%;\n    width: 70px;\n    height: 70px;\n    animation: float3d 15s ease-in-out infinite reverse;\n}\n\n.el-3 {\n    top: 20%;\n    right: 4%;\n    width: 130px;\n    height: 130px;\n    animation: float3d 18s ease-in-out infinite 2s;\n}\n\n.el-4 {\n    top: 70%;\n    right: 4%;\n    width: 90px;\n    height: 90px;\n    animation: float3d 14s ease-in-out infinite 1s reverse;\n}\n\n@keyframes float3d {\n\n    0%,\n    100% {\n        transform: translateY(0) rotateX(10deg) rotateY(10deg);\n    }\n\n    33% {\n        transform: translateY(-30px) rotateX(-5deg) rotateY(20deg);\n    }\n\n    66% {\n        transform: translateY(20px) rotateX(15deg) rotateY(-10deg);\n    }\n}\n\n/* ── Stats ───────────────────────────────────────────── */\n.stats-container {\n    display: flex;\n    justify-content: center;\n    gap: 3rem;\n    margin-top: 4rem;\n    flex-wrap: wrap;\n}\n\n.stat-item {\n    text-align: center;\n}\n\n.stat-number {\n    font-size: 2.8rem;\n    font-weight: 800;\n    background: var(--accent-gradient);\n    -webkit-background-clip: text;\n    background-clip: text;\n    -webkit-text-fill-color: transparent;\n    margin-bottom: 0.5rem;\n}\n\n.stat-label {\n    color: var(--text-secondary);\n    font-size: 0.9rem;\n    font-weight: 500;\n    text-transform: uppercase;\n    letter-spacing: 0.05em;\n}\n\n/* ── Domains Section ─────────────────────────────────── */\n.domains-section {\n    padding: 5rem 2rem;\n    position: relative;\n    z-index: 5;\n    background: linear-gradient(to bottom, transparent, rgba(15, 17, 21, 1));\n}\n\n.section-header {\n    text-align: center;\n    margin-bottom: 3.5rem;\n}\n\n.domain-grid {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));\n    gap: 1.5rem;\n    max-width: 1200px;\n    margin: 0 auto;\n}\n\n.domain-card {\n    background: rgba(22, 24, 29, 0.6);\n    border: 1px solid rgba(255, 255, 255, 0.05);\n    border-radius: var(--radius-xl);\n    padding: 2rem;\n    position: relative;\n    overflow: hidden;\n    backdrop-filter: blur(20px);\n    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);\n    display: flex;\n    flex-direction: column;\n    min-height: 240px;\n}\n\n.domain-card::before {\n    content: '';\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(59, 130, 246, 0.1), transparent 40%);\n    z-index: 0;\n    opacity: 0;\n    transition: opacity 0.3s;\n}\n\n.domain-card:hover {\n    transform: translateY(-8px) scale(1.02);\n    border-color: rgba(59, 130, 246, 0.3);\n    box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.1);\n}\n\n.domain-card:hover::before {\n    opacity: 1;\n}\n\n.domain-icon-wrapper {\n    width: 56px;\n    height: 56px;\n    border-radius: var(--radius-lg);\n    background: rgba(59, 130, 246, 0.1);\n    color: var(--accent-primary);\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    margin-bottom: 1.25rem;\n    position: relative;\n    z-index: 1;\n    transition: all 0.3s ease;\n}\n\n.domain-card:hover .domain-icon-wrapper {\n    background: var(--accent-gradient);\n    color: white;\n    transform: scale(1.1) rotate(5deg);\n}\n\n.domain-title {\n    font-size: 1.35rem;\n    font-weight: 700;\n    margin-bottom: 0.75rem;\n    position: relative;\n    z-index: 1;\n}\n\n.domain-desc {\n    color: var(--text-secondary);\n    line-height: 1.6;\n    margin-bottom: 1.5rem;\n    flex-grow: 1;\n    position: relative;\n    z-index: 1;\n    font-size: 0.95rem;\n}\n\n.domain-link {\n    display: inline-flex;\n    align-items: center;\n    gap: 0.5rem;\n    color: var(--accent-primary);\n    font-weight: 600;\n    font-size: 0.95rem;\n    margin-top: auto;\n    position: relative;\n    z-index: 1;\n    transition: gap 0.3s;\n}\n\n.domain-card:hover .domain-link {\n    gap: 1rem;\n}\n\n/* ── Developer Section ───────────────────────────────── */\n.developer-section {\n    padding: 5rem 2rem;\n    position: relative;\n    z-index: 5;\n    background: linear-gradient(to top, rgba(15, 17, 21, 1), transparent);\n}\n\n.dev-cards-grid {\n    display: grid;\n    grid-template-columns: repeat(2, 1fr);\n    gap: 2rem;\n    max-width: 1200px;\n    margin: 0 auto;\n}\n\n.dev-container {\n    background: rgba(22, 24, 29, 0.6);\n    border: 1px solid rgba(255, 255, 255, 0.05);\n    border-radius: var(--radius-2xl);\n    padding: 2.5rem;\n    backdrop-filter: blur(20px);\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    text-align: center;\n    gap: 2rem;\n    box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.5);\n    position: relative;\n    overflow: hidden;\n}\n\n.dev-container::before {\n    content: '';\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 4px;\n    background: var(--accent-gradient);\n}\n\n.dev-avatar-wrapper {\n    position: relative;\n    width: 180px;\n    max-width: 180px;\n    perspective: 1000px;\n    margin: 0 auto;\n}\n\n.dev-avatar {\n    width: 100%;\n    aspect-ratio: 1;\n    object-fit: cover;\n    border-radius: 50%;\n    z-index: 2;\n    position: relative;\n    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6);\n    border: 2px solid rgba(255, 255, 255, 0.1);\n    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n.dev-avatar-wrapper:hover .dev-avatar {\n    transform: rotateY(5deg) scale(1.05);\n}\n\n.dev-glow {\n    position: absolute;\n    top: 50%;\n    left: 50%;\n    transform: translate(-50%, -50%);\n    width: 120%;\n    height: 120%;\n    background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%);\n    z-index: 1;\n    filter: blur(20px);\n    animation: pulse 4s ease-in-out infinite;\n}\n\n@keyframes pulse {\n\n    0%,\n    100% {\n        transform: translate(-50%, -50%) scale(1);\n        opacity: 0.8;\n    }\n\n    50% {\n        transform: translate(-50%, -50%) scale(1.1);\n        opacity: 1;\n    }\n}\n\n.dev-info {\n    flex: 1;\n    width: 100%;\n}\n\n.dev-badge {\n    display: inline-block;\n    padding: 0.4rem 0.9rem;\n    background: rgba(59, 130, 246, 0.1);\n    color: var(--accent-primary);\n    border-radius: var(--radius-full);\n    font-size: 0.8rem;\n    font-weight: 600;\n    letter-spacing: 1px;\n    text-transform: uppercase;\n    margin-bottom: 1.25rem;\n}\n\n.dev-name {\n    font-size: clamp(2rem, 4vw, 3rem);\n    font-weight: 800;\n    margin-bottom: 0.4rem;\n    background: var(--text-primary);\n    -webkit-background-clip: text;\n    -webkit-text-fill-color: transparent;\n    background-clip: text;\n}\n\n.dev-studies {\n    font-size: 1.1rem;\n    color: var(--text-secondary);\n    font-weight: 500;\n    margin-bottom: 1.5rem;\n}\n\n.dev-passion {\n    display: flex;\n    flex-direction: column;\n    gap: 0.75rem;\n    align-items: center;\n    padding: 1.25rem;\n    background: rgba(255, 255, 255, 0.03);\n    border-radius: var(--radius-lg);\n    border: 1px solid rgba(255, 255, 255, 0.05);\n    margin-bottom: 2rem;\n    text-align: center;\n}\n\n.passion-icon {\n    color: inherit;\n    flex-shrink: 0;\n}\n\n.dev-passion p {\n    color: var(--text-secondary);\n    line-height: 1.6;\n    margin: 0;\n    font-size: 0.95rem;\n}\n\n.dev-passion strong {\n    color: var(--text-primary);\n}\n\n.dev-links {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 0.75rem;\n    justify-content: center;\n}\n\n.dev-link-btn {\n    display: inline-flex;\n    align-items: center;\n    gap: 0.6rem;\n    padding: 0.75rem 1.25rem;\n    border-radius: var(--radius-lg);\n    font-weight: 600;\n    font-size: 0.875rem;\n    transition: all 0.3s ease;\n    text-decoration: none;\n}\n\n.email-btn {\n    background: #ffffff;\n    color: #0f1115;\n}\n\n.email-btn:hover {\n    transform: translateY(-2px);\n    box-shadow: 0 10px 20px -5px rgba(255, 255, 255, 0.2);\n}\n\n.github-btn {\n    background: #24292e;\n    color: white;\n}\n\n.github-btn:hover {\n    background: #2f363d;\n    transform: translateY(-2px);\n    box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.4);\n}\n\n.linkedin-btn {\n    background: #0077b5;\n    color: white;\n}\n\n.linkedin-btn:hover {\n    background: #0088cc;\n    transform: translateY(-2px);\n    box-shadow: 0 10px 20px -5px rgba(0, 119, 181, 0.4);\n}\n\n.insta-btn {\n    background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);\n    color: white;\n}\n\n.insta-btn:hover {\n    transform: translateY(-2px);\n    box-shadow: 0 10px 20px -5px rgba(220, 39, 67, 0.4);\n}\n\n/* ══════════════════════════════════════════════════════\n   RESPONSIVE BREAKPOINTS\n══════════════════════════════════════════════════════ */\n\n/* Tablet & below — 1024px */\n@media (max-width: 1024px) {\n\n    .el-1,\n    .el-2,\n    .el-3,\n    .el-4 {\n        opacity: 0.5;\n    }\n\n    .domain-grid {\n        grid-template-columns: repeat(2, 1fr);\n    }\n}\n\n/* Tablet — 768px */\n@media (max-width: 768px) {\n    .hero-section {\n        padding: 5rem 1.25rem 3rem;\n        min-height: 80vh;\n    }\n\n    .hero-title {\n        font-size: clamp(2rem, 9vw, 3.2rem);\n    }\n\n    .hero-actions {\n        gap: 0.75rem;\n    }\n\n    .btn-primary,\n    .btn-secondary {\n        padding: 0.875rem 1.5rem;\n        font-size: 0.95rem;\n    }\n\n    .stats-container {\n        gap: 2rem;\n    }\n\n    .stat-number {\n        font-size: 2.2rem;\n    }\n\n    .domains-section {\n        padding: 3rem 1.25rem;\n    }\n\n    .domain-grid {\n        grid-template-columns: 1fr;\n        max-width: 500px;\n    }\n\n    .section-header h2 {\n        font-size: 2rem !important;\n    }\n\n    .developer-section {\n        padding: 3rem 1.25rem;\n    }\n\n    .dev-cards-grid {\n        grid-template-columns: 1fr;\n        max-width: 600px;\n        margin: 0 auto;\n    }\n\n    .dev-container {\n        padding: 2rem;\n        gap: 1.5rem;\n    }\n\n    .dev-avatar-wrapper {\n        max-width: 160px;\n        width: 160px;\n    }\n\n    .dev-info {\n        min-width: unset;\n        width: 100%;\n    }\n\n    .dev-passion {\n        text-align: center;\n    }\n\n    .dev-links {\n        justify-content: center;\n    }\n\n    .dev-link-btn {\n        padding: 0.65rem 1rem;\n        font-size: 0.82rem;\n    }\n\n    /* Hide large floating decorations on mobile */\n    .el-3,\n    .el-4 {\n        display: none;\n    }\n\n    .el-1 {\n        width: 60px;\n        height: 60px;\n        top: 8%;\n        left: 2%;\n    }\n\n    .el-2 {\n        width: 50px;\n        height: 50px;\n        top: 75%;\n        left: 1%;\n    }\n}\n\n/* Mobile — 480px */\n@media (max-width: 480px) {\n    .hero-section {\n        padding: 4rem 1rem 2.5rem;\n    }\n\n    .hero-title {\n        font-size: clamp(1.8rem, 11vw, 2.8rem);\n    }\n\n    .hero-description {\n        font-size: 0.95rem;\n        padding: 0;\n    }\n\n    .hero-badge {\n        font-size: 0.78rem;\n        padding: 0.4rem 0.9rem;\n    }\n\n    .btn-primary,\n    .btn-secondary {\n        width: 100%;\n        justify-content: center;\n    }\n\n    .hero-actions {\n        flex-direction: column;\n        gap: 0.75rem;\n    }\n\n    .stats-container {\n        gap: 1.5rem;\n    }\n\n    .stat-number {\n        font-size: 1.8rem;\n    }\n\n    .domain-card {\n        padding: 1.5rem;\n        min-height: 200px;\n    }\n\n    .domain-title {\n        font-size: 1.1rem;\n    }\n\n    .section-header h2 {\n        font-size: 1.6rem !important;\n    }\n\n    .section-header p {\n        font-size: 0.95rem !important;\n    }\n\n    .dev-container {\n        padding: 1.5rem;\n    }\n\n    .dev-avatar-wrapper {\n        width: 140px;\n        max-width: 140px;\n    }\n\n    .dev-name {\n        font-size: 1.8rem;\n    }\n\n    .dev-studies {\n        font-size: 0.95rem;\n    }\n\n    .dev-links {\n        gap: 0.5rem;\n    }\n\n    .dev-link-btn {\n        font-size: 0.78rem;\n        padding: 0.6rem 0.85rem;\n    }\n}\n\n/* Large screens — 1400px+ */\n@media (min-width: 1400px) {\n    .hero-section {\n        padding: 8rem 4rem;\n    }\n\n    .domain-grid {\n        grid-template-columns: repeat(3, 1fr);\n        gap: 2rem;\n        max-width: 1400px;\n    }\n\n    .dev-container {\n        padding: 3rem;\n    }\n\n    .dev-cards-grid {\n        max-width: 1400px;\n    }\n}\n/* Current study-desk illustration is retained inside the historical centered hero. */\n.hero-section { isolation: isolate; }\n.legacy-hero-art { position: absolute; z-index: 1; right: max(1rem, calc((100vw - 1320px) / 2)); top: 50%; width: min(34vw, 420px); transform: translateY(-46%); opacity: .36; pointer-events: none; filter: drop-shadow(0 18px 36px rgba(75,65,150,.18)); }\n.legacy-hero-art svg { display: block; width: 100%; height: auto; }\n.hero-content { z-index: 3; }\n.hero-badge { position: relative; z-index: 3; }\n.domain-icon-wrapper { overflow: hidden; }\n.domain-icon-wrapper .pm-domain-art { width: 116px; height: 92px; color: #b9adff; }\n.domain-icon-wrapper .pm-domain-art__accent { stroke: #a78bfa; }\n@media (max-width: 768px) { .legacy-hero-art { right: 50%; top: auto; bottom: -2.25rem; width: min(72vw, 360px); transform: translateX(50%); opacity: .16; } }\n@media (prefers-reduced-motion: reduce) { .legacy-hero-art { transition: none !important; } }";

export default function LandingPage() {
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
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
            <style>{LEGACY_HOME_STYLES}</style>
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
                        initial={reduceMotion ? false : { opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.55 }}
                    >
                        <Icons.Sparkles size={15} /> A clearer way to prepare
                    </motion.div>

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
                        <button className="btn-secondary" onClick={() => navigate('/test-rooms')}>
                            Join Test Room
                        </button>
                        {/* <button className="btn-google-cta" onClick={() => navigate('/signup?mode=signup&method=google')}>
                            <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </button> */}
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
                <motion.div
                    className="legacy-hero-art"
                    initial={reduceMotion ? false : { opacity: 0, scale: .96, y: 12 }}
                    animate={reduceMotion ? { opacity: .16 } : { opacity: .36, scale: 1, y: [0, -8, 0] }}
                    transition={reduceMotion ? { duration: 0 } : { opacity: { duration: .9 }, scale: { duration: .9 }, y: { duration: 9, repeat: Infinity, ease: 'easeInOut' } }}
                    aria-hidden="true"
                >
                    <StudyDeskArtwork />
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
                        
                        return (
                            <motion.article key={domain.id} variants={itemVariants}>
                                <Link to={`/domains/${domain.id}/courses`} className="domain-card">
                                    <div className="domain-icon-wrapper">
                                        <DomainArtwork id={domain.id} />
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
        </main >
    );
}