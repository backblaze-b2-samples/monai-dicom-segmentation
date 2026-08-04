# Product

## Register

product

## Users

Medical-imaging researchers and data engineers who need to land large DICOM/NIfTI
volumes in object storage, run reproducible MONAI segmentation over them on-device,
and keep every derived artifact next to the source data. Their context: heavy,
fast-landing scientific data with write-amplification, and a strong preference for
open-source models that run locally with no second API key.

## Product Purpose

A full-stack sample (Next.js 16 + React 19 + Tailwind v4 + shadcn/ui frontend,
FastAPI backend) that runs a MONAI segmentation pipeline over imaging volumes stored
in Backblaze B2. Ingest a volume, segment it with a pretrained MONAI zoo bundle
(CPU-default, GPU auto-detected), and review the mask overlay in a slice viewer — with
the source, processed volume, mask, previews, and manifest all versioned under one B2
prefix. Success = a researcher can clone it, add only B2 credentials, ingest a CT
volume, and see a real segmentation and its artifacts land in their bucket. It is
built on the B2 vibe-coding starter kit and keeps that kit's spine and quality bar.

## Brand Personality

Confident, precise, quietly professional. Voice is direct and free of hype ("Stop
wiring boilerplate and start building"). The interface should feel like a modern
developer tool — considered, calm, trustworthy — not a marketing showpiece. It is a
**neutral foundation** that others rebrand: the design carries craft through restraint,
not through a strong opinionated identity of its own.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this kit exists to help builders avoid.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. It is scaffolding to be rebranded, not a hero page.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Must read as production-grade.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **Practice what you preach.** The kit itself must model the production quality it
  asks agents to produce. Slop here propagates into every project built on it.
- **Neutral foundation, easy to rebrand.** Identity lives in tokens (`globals.css`) and
  one config file. Screens are built from the shared UI kit so a rebrand is a token
  swap, not a rewrite.
- **Earned familiarity over novelty.** Use standard, trusted affordances (top bar +
  side nav, command palette, data tables). The tool disappears into the task.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), and error (says what's wrong + offers retry) — never
  half-shipped.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Full light and dark theme parity.
