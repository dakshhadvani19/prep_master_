# PrepMaster student interface direction

## Product thesis

PrepMaster is a student examination-preparation product. The student-facing journey should feel like a well-composed study desk: focused, credible and calm, with the paper, answer sheet, course structure and academic materials providing the visual vocabulary.

## Visual language

- Canvas: retain the existing near-black --bg-primary (#0f1115) and charcoal surface tokens.
- Surfaces: retain the graphite canvas and the established softly squared card geometry. Academic-domain, course, semester and subject-selection cards use clearly visible, solid charcoal surfaces with crisp white edge definition, a subtle raised inner edge and controlled depth. Avoid washed-out translucency, backdrop blur, reflection gradients and decorative shine. Gold is reserved for small meaningful accents and the explicit selected/hover state. Contact cards remain quieter.
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

## Exam and Test Room experience

- The exam-generation selection flow and Test Room use the existing navbar's dark glass language: dense charcoal/blue-tinted translucency, strong readable fills, crisp white edges and restrained blue reflections. Avoid washed-out opacity.
- Exam type, generation mode and difficulty are tactile selection controls. Selected states use a clear blue surface and edge with aria-pressed semantics.
- In active exams, the timer/header and question navigator are functional glass layers. Question numbers are rounded bubbles; one Framer Motion layout pill moves between them with a spring transition. Current, answered and unanswered states remain distinct.
- Question and answer content uses a more opaque dark surface beneath the glass controls. The content remains readable while selection and navigation carry the fluid motion.
- Test Room uses the same material for room overview, join-code tile, participant roster, duration control and waiting panel. Blue is the primary interactive color inside exam and Test Room flows; host, warning and result states retain their semantic meaning.

## Motion language

Use the existing Framer Motion dependency. Motion is deliberate, brief and tied to an event:
- Hero: clipped line reveal with slight blur resolving to crisp text, staggered with supporting content.
- Domain/course cards: one staggered entrance when the grid enters view; slight lift on hover, gentle compression on press. Keep card surfaces crisp and solid rather than translucent or reflective.
- Selection: smooth color/surface transition and a clear aria-pressed / aria-expanded state.
- Reduced motion: remove nonessential translation, blur, floating and stagger effects when prefers-reduced-motion is enabled.
- Avoid repeated fade-up on every section, elastic overshoot, perpetual decoration and animation that delays a click.

## Material and accessibility rules

Use Apple-informed clarity, hierarchy and craft rather than copying Liquid Glass. Academic-domain, course, semester and subject-choice surfaces should read as solid, tactile cards: clearly visible charcoal fills, clean white borders, a measured corner radius and subtle depth. Avoid faded overlay gradients, backdrop blur and ornamental reflection sweeps. Selected semesters and expanded subjects use a clearly defined champagne-gold edge and solid warmer charcoal fill, with aria-pressed / aria-expanded preserving the state semantically. Keep keyboard focus visible, text contrast strong and tap targets practical.

## Scope boundaries

This design contract applies to the student homepage, academic domain cards, course explorer, semester/subject selection, exam generation and difficulty selection, Test Room lobby, and active exam/Test Room question navigation. Dashboards and admin surfaces remain outside this change.
