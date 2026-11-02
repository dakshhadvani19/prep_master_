# PrepMaster student interface direction

## Product thesis

PrepMaster is a student examination-preparation product. The student-facing journey should feel like a well-composed study desk: focused, credible and calm, with the paper, answer sheet, course structure and academic materials providing the visual vocabulary.

## Visual language

- Canvas: retain the existing near-black --bg-primary (#0f1115) and charcoal surface tokens.
- Surfaces: use layered charcoal, semi-translucent fills, restrained backdrop blur, a fine upper light edge and soft depth. Keep text-bearing surfaces opaque enough to preserve contrast.
- Brand emphasis: the student homepage now uses a white-first object palette over the unchanged graphite canvas. The exam paper, answer sheet, pencil, department line illustrations, headings and primary action are white or cool-neutral. Keep warm amber --gold (#ffb454) and --gold-bright (#ffd08a) for small illustration details, fine edge highlights, focus accents and reflected glow/shadows; do not turn large objects or text into gold surfaces.
- Scope: this white-dominant treatment applies only to the homepage hero, department illustrations/cards and homepage contact section. The course explorer, semester/subject catalog, exam configuration, Test Room and admin screens retain their established colors.
- Existing global blue and violet tokens are not redefined. The homepage's gold is a local light/shadow accent, not a new global action color.
- Type: keep the existing Inter interface family. Use an Apple-informed hierarchy through readable 600–700 weights, measured tracking, compact display leading and clear body contrast; do not add a new font or imitate Apple's platform UI.
- Radius: soft but differentiated. Larger rounded surfaces for cards, fully rounded compact actions, and smaller radii for nested controls.
- Illustrations: preserve the custom exam-paper hero and six subject-specific line illustrations. They are PrepMaster-specific assets, not stock icons or generic AI-generated blobs.

## Layout

- Homepage hero: left-aligned student value proposition paired with the study-desk drawing.
- Departments: a consistent three-column desktop grid, two columns on tablet and one column on narrow phones. Six cards share equal dimensions at each breakpoint. Each card uses its own discipline illustration in a shared visual frame.
- Course list: a responsive, equal-height card grid with program name and semester count prominent.
- Semester/subject selection: clear two-step hierarchy with larger tap areas and explicit selected state.
- Contact: retain existing developer identities and links; soften the surfaces without adding new sections or social claims.

## Motion language

Use the existing Framer Motion dependency. Motion is deliberate, brief and tied to an event:
- Hero: clipped line reveal with slight blur resolving to crisp text, staggered with supporting content.
- Domain/course cards: one staggered entrance when the grid enters view; slight lift on hover, gentle compression on press.
- Selection: smooth color/surface transition and a clear aria-pressed / aria-expanded state.
- Reduced motion: remove nonessential translation, blur, floating and stagger effects when prefers-reduced-motion is enabled.
- Avoid repeated fade-up on every section, elastic overshoot, perpetual decoration and animation that delays a click.

## Material and accessibility rules

The visual treatment is Liquid-Glass-inspired, not a literal native Apple implementation. Use translucency and blur selectively on interactive surfaces and top-level functional layers. Keep content-bearing panels and exam text readable; do not stack multiple blurred surfaces. Provide a sufficiently opaque fallback when backdrop filtering is unavailable. Keep visible focus, keyboard operation, 44px-class tap targets where practical and non-color selected-state semantics.

## Scope boundaries

This design contract applies to the student homepage, academic domain cards, course explorer, and semester/subject selection. Exam type/mode/difficulty configuration, the Test Room dialog/page, exam-taking UI, dashboards and admin surfaces are outside this change.
