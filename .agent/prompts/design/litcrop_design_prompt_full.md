# LitCrop Design Prompt & Production Guide

## Overview
This document defines a unified prompt and production guideline for generating the LitCrop visual style across:

- Stable Diffusion
- Midjourney
- DALL·E
- Google Nano Banana (Gemini image generation)
- SVG generation workflows
- Figma / Illustrator manual recreation

---

## 1. Core Concept

A minimalist line-art outdoor landscape that transitions into a brand logo.

Key narrative:
> Nature → Water → Field → Crop → Brand (LitCrop)

---

## 2. Universal Prompt (Base)

```
Minimalist line-art illustration of an outdoor landscape with mountains, flowing water, agricultural fields, and crops forming stylized typography. Thin clean vector lines, no fill, subtle hand-drawn imperfections. Horizontal panoramic composition with strong negative space. Include abstract flowing lines representing terrain or data layers. Calm, modern, nature-inspired aesthetic. Limited color palette with soft neon green, light blue, and muted orange accents.
```

---

## 3. Tool-Specific Optimization

### Stable Diffusion / SDXL
Add:
```
vector illustration, line art, clean stroke, SVG style, no shading, flat design, high detail lines
negative prompt: photorealistic, 3d, blur, noise, gradients, textures
```

### Midjourney
Add:
```
--style raw --v 6 --q 2 --ar 16:9
```

Optional:
```
minimal vector line art, clean stroke, no fill, outline only
```

---

### DALL·E / Nano Banana (Gemini)

Use descriptive clarity:
- Explicitly state "vector line art"
- Avoid ambiguity (e.g., avoid "sketchy painting")

Example addition:
```
The image should look like a clean SVG vector illustration with consistent stroke width and no shading.
```

---

## 4. SVG Generation Prompt

```
Generate a clean SVG line-art illustration using only <path>, <circle>, and <line> elements. Use stroke-based drawing only (no fills except optional background). Maintain consistent stroke width (2–3px). Use smooth curves for natural elements (Bezier curves). Organize elements into logical groups (mountain, river, field, crop, typography).
```

---

## 5. Animation Concept (for Web)

Sequence:

1. Mountain lines draw in
2. River flows (dash animation)
3. Field geometry appears
4. Crops grow upward
5. Crop bends into “C”
6. Remaining letters fade in

Techniques:
- stroke-dashoffset
- CSS keyframes
- SVG path morph (optional with JS)

---

## 6. Figma / Illustrator Design Spec

### Stroke
- Weight: 2px–3px
- Round caps & joins
- Slight variance allowed (organic feel)

### Colors
- Base: muted purple / gray background
- Accent:
  - Green: crops
  - Blue: water
  - Orange: flow lines

### Composition
- Horizontal layout
- Balanced whitespace
- Layered depth (background → foreground)

---

## 7. Typography Integration

- L: mountain + river
- C: bending crop
- Other letters: geometric but organic
- Maintain consistency with line style

---

## 8. Design Principles

- Minimalism first
- No clutter
- Meaningful abstraction
- Nature + system (data-like flow)

---

## 9. Extension Ideas

- Add mascot (mole) as final animation
- Interactive hover effects
- Data visualization overlay (IoT / agriculture)

---

## Deliverable Usage

This guide ensures:
- Cross-tool consistency
- Scalable vector design
- Animation-ready assets

