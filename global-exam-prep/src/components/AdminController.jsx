/**
 * PrepMaster command orrery — decorative, algorithm-driven SVG.
 * Abstract academic nodes only. No live data. Hidden on small screens.
 */
import { useEffect, useRef } from 'react';

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

const CX = 260;
const CY = 148;
const NODES = [
    { glyph: 'book', hue: '#8d7bff' },
    { glyph: 'sem', hue: '#8d7bff' },
    { glyph: 'sub', hue: '#ffb454' },
    { glyph: 'q', hue: '#8d7bff' },
    { glyph: 'rank', hue: '#ffb454' },
    { glyph: 'fb', hue: '#8d7bff' },
];

function nodePos(i, t, spec) {
    const base = (i / NODES.length) * Math.PI * 2 - Math.PI / 2;
    const ang = base + spec.drift[i] + Math.sin(t * Math.PI * 2 * spec.orbitHz[i] + spec.phase[i]) * spec.wobble[i];
    const r = spec.radius[i] + Math.sin(t * Math.PI * 2 * spec.breatheHz[i] + spec.phase[i] * 1.7) * spec.breathe[i];
    return { x: CX + Math.cos(ang) * r, y: CY + Math.sin(ang) * r * 0.78 };
}

function makeSpec(rng) {
    return {
        duration: 7200 + rng() * 2800,
        radius: NODES.map(() => 92 + rng() * 28),
        wobble: NODES.map(() => 0.04 + rng() * 0.07),
        breathe: NODES.map(() => 4 + rng() * 7),
        orbitHz: NODES.map(() => 0.35 + rng() * 0.55),
        breatheHz: NODES.map(() => 0.7 + rng() * 0.8),
        phase: NODES.map(() => rng() * Math.PI * 2),
        drift: NODES.map(() => (rng() - 0.5) * 0.22),
        focus: Math.floor(rng() * NODES.length),
        scanDir: rng() > 0.5 ? 1 : -1,
        packetCount: 4 + Math.floor(rng() * 4),
        packetFrom: Array.from({ length: 8 }, () => Math.floor(rng() * NODES.length)),
        packetDelay: Array.from({ length: 8 }, () => rng() * 0.55),
        packetDur: Array.from({ length: 8 }, () => 0.22 + rng() * 0.28),
        starTwinkle: Array.from({ length: 28 }, () => rng()),
        latticeRot: (rng() - 0.5) * 0.35,
        corePulse: 0.72 + rng() * 0.45,
    };
}

function Glyph({ type, color }) {
    const s = { fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (type === 'book') {
        return <g {...s}><path d="M9 24 V10 h10 a4 4 0 0 1 0 8 H9" /><path d="M9 18 h10" /></g>;
    }
    if (type === 'sem') {
        return <g {...s}><circle cx="11" cy="13" r="2.4" /><circle cx="21" cy="13" r="2.4" /><circle cx="16" cy="21" r="2.4" /><path d="M13 13h6 M16 15v4" /></g>;
    }
    if (type === 'sub') {
        return <g {...s}><path d="M16 8 l8 14 H8 z" /></g>;
    }
    if (type === 'q') {
        return <g {...s}><path d="M10 11 h12 M10 16 h12 M10 21 h8" /></g>;
    }
    if (type === 'rank') {
        return <g {...s}><path d="M11 22 V14 h4 v8 M17 22 V10 h4 v12" /></g>;
    }
    return <g {...s}><path d="M10 18 q6-10 12 0 v4 q-6 4-12 0 z" /></g>;
}

export default function AdminController({ gold = false }) {
    const root = useRef(null);
    const accent = gold ? '#ffb454' : '#8d7bff';

    useEffect(() => {
        const svg = root.current;
        if (!svg) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return undefined;

        const nodeEls = [...svg.querySelectorAll('[data-node]')];
        const cableEls = [...svg.querySelectorAll('[data-cable]')];
        const packetEls = [...svg.querySelectorAll('[data-packet]')];
        const stars = [...svg.querySelectorAll('[data-star]')];
        const lattice = svg.querySelector('[data-lattice]');
        const scan = svg.querySelector('[data-scan]');
        const coreGlow = svg.querySelector('[data-core-glow]');
        const coreDot = svg.querySelector('[data-core-dot]');
        const ringA = svg.querySelector('[data-ring-a]');
        const ringB = svg.querySelector('[data-ring-b]');
        const sweep = svg.querySelector('[data-sweep]');

        let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
        let spec = makeSpec(mulberry32(seed));
        let start = performance.now();
        let raf = 0;

        function cables(t) {
            cableEls.forEach((el, i) => {
                const a = nodePos(i, t, spec);
                const cx1 = lerp(CX, a.x, 0.38);
                const cy1 = lerp(CY, a.y, 0.12);
                el.setAttribute('d', `M${CX} ${CY} Q${cx1} ${cy1} ${a.x} ${a.y}`);
                const pulse = 0.18 + 0.55 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.4 + spec.phase[i]));
                el.setAttribute('stroke-opacity', String(0.2 + pulse * 0.45));
            });
        }

        function frame(now) {
            let u = (now - start) / spec.duration;
            if (u >= 1) {
                seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d) >>> 0;
                spec = makeSpec(mulberry32(seed || 1));
                start = now;
                u = 0;
            }
            const t = ease(clamp01(u));
            const breath = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * spec.corePulse);

            nodeEls.forEach((g, i) => {
                const p = nodePos(i, t, spec);
                const focus = spec.focus === i ? 1 + 0.12 * Math.sin(u * Math.PI) : 1;
                const appear = clamp01((u - i * 0.04) / 0.18);
                const s = 0.86 + appear * 0.14 * focus;
                g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${s}) translate(-16 -16)`);
                g.setAttribute('opacity', String(0.35 + appear * 0.65));
            });

            cables(t);

            packetEls.forEach((pkt, i) => {
                if (i >= spec.packetCount) {
                    pkt.setAttribute('opacity', '0');
                    return;
                }
                const local = (u - spec.packetDelay[i]) / spec.packetDur[i];
                if (local < 0 || local > 1) {
                    pkt.setAttribute('opacity', '0');
                    return;
                }
                const n = spec.packetFrom[i];
                const p = nodePos(n, t, spec);
                const e = ease(local);
                const x = lerp(p.x, CX, e);
                const y = lerp(p.y, CY, e);
                pkt.setAttribute('cx', String(x));
                pkt.setAttribute('cy', String(y));
                pkt.setAttribute('opacity', String(0.15 + 0.85 * Math.sin(local * Math.PI)));
                pkt.setAttribute('fill', local > 0.6 ? '#ffb454' : '#8d7bff');
            });

            stars.forEach((s, i) => {
                const tw = spec.starTwinkle[i] ?? 0.5;
                const o = 0.08 + 0.22 * (0.5 + 0.5 * Math.sin(u * Math.PI * 2 * (0.6 + tw) + tw * 8));
                s.setAttribute('opacity', String(o));
            });

            if (lattice) {
                const rot = spec.latticeRot * 18 * Math.sin(u * Math.PI);
                lattice.setAttribute('transform', `rotate(${rot} ${CX} ${CY})`);
                lattice.setAttribute('opacity', String(0.12 + 0.1 * breath));
            }
            if (scan) {
                const ang = spec.scanDir * (u * 320 - 40);
                scan.setAttribute('transform', `rotate(${ang} ${CX} ${CY})`);
                scan.setAttribute('opacity', String(0.08 + 0.16 * Math.sin(u * Math.PI)));
            }
            if (coreGlow) {
                coreGlow.setAttribute('r', String(26 + breath * 10));
                coreGlow.setAttribute('opacity', String(0.18 + breath * 0.22));
            }
            if (coreDot) coreDot.setAttribute('r', String(4.2 + breath * 1.8));
            if (ringA) ringA.setAttribute('transform', `rotate(${u * 220} ${CX} ${CY})`);
            if (ringB) ringB.setAttribute('transform', `rotate(${-u * 140} ${CX} ${CY})`);
            if (sweep) {
                sweep.setAttribute('x', String(40 + u * 380));
                sweep.setAttribute('opacity', String(0.07 + 0.1 * Math.sin(u * Math.PI)));
            }

            raf = window.requestAnimationFrame(frame);
        }

        raf = window.requestAnimationFrame(frame);
        return () => window.cancelAnimationFrame(raf);
    }, [gold]);

    const stars = Array.from({ length: 28 }, (_, i) => {
        const x = 24 + ((i * 97) % 472);
        const y = 18 + ((i * 53) % 264);
        return <circle key={i} data-star cx={x} cy={y} r={i % 4 === 0 ? 1.4 : 0.9} fill={i % 5 === 0 ? '#ffb454' : '#8d7bff'} opacity="0.15" />;
    });

    return (
        <svg
            ref={root}
            className="admin-ctrl"
            viewBox="0 0 520 300"
            role="img"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <radialGradient id="ac-field" cx="50%" cy="48%" r="55%">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
                    <stop offset="42%" stopColor="#8d7bff" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#0f1115" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="ac-scan" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8d7bff" stopOpacity="0" />
                    <stop offset="50%" stopColor="#ffb454" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#8d7bff" stopOpacity="0" />
                </linearGradient>
                <filter id="ac-soft" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="6" />
                </filter>
            </defs>

            <rect width="520" height="300" fill="url(#ac-field)" />
            <rect data-sweep x="40" y="0" width="70" height="300" fill="url(#ac-scan)" opacity="0.08" />
            <g data-lattice fill="none" stroke="rgba(141,123,255,0.35)" strokeWidth="0.6">
                <polygon points="260,58 352,104 352,192 260,238 168,192 168,104" />
                <polygon points="260,88 318,122 318,174 260,208 202,174 202,122" />
            </g>
            {stars}

            <g data-scan>
                <path d={`M${CX} ${CY} L${CX + 210} ${CY - 36} L${CX + 210} ${CY + 36} Z`} fill="rgba(255,180,84,0.07)" />
            </g>

            <circle data-ring-a cx={CX} cy={CY} r="54" fill="none" stroke="rgba(141,123,255,0.45)" strokeWidth="1.1" strokeDasharray="3 9" />
            <circle data-ring-b cx={CX} cy={CY} r="72" fill="none" stroke="rgba(255,180,84,0.35)" strokeWidth="1" strokeDasharray="1 11" />

            {NODES.map((n, i) => (
                <path key={`c-${n.glyph}`} data-cable fill="none" stroke={n.hue} strokeWidth="1.15" strokeOpacity="0.35" />
            ))}

            <circle data-core-glow cx={CX} cy={CY} r="28" fill={accent} opacity="0.22" filter="url(#ac-soft)" />
            <circle cx={CX} cy={CY} r="18" fill="#12141a" stroke={accent} strokeWidth="1.6" />
            <circle data-core-dot cx={CX} cy={CY} r="5" fill={accent} />

            {NODES.map((n, i) => {
                const ang = (i / NODES.length) * Math.PI * 2 - Math.PI / 2;
                const x = CX + Math.cos(ang) * 108 - 16;
                const y = CY + Math.sin(ang) * 84 - 16;
                return (
                    <g key={n.glyph} data-node transform={`translate(${x} ${y})`}>
                        <rect width="32" height="32" rx="9" fill="#14161c" stroke={n.hue} strokeWidth="1.35" />
                        <Glyph type={n.glyph} color={n.hue} />
                    </g>
                );
            })}

            {Array.from({ length: 8 }, (_, i) => (
                <circle key={`p-${i}`} data-packet r="2.4" fill="#8d7bff" opacity="0" />
            ))}
        </svg>
    );
}
