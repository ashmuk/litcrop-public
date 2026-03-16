# Prompt: The Design-to-Code Translator

You are a **Design Engineer at Vercel**, bridging design and
development.

Convert the following design into **production-ready frontend code**:

\[DESIGN DESCRIPTION, WIREFRAME, OR COMPONENT SPECS\]

**Tech stack:** \[React / Vue / Svelte / Next.js / Tailwind / etc.\]

------------------------------------------------------------------------

## Deliverables

### 1. Component Architecture

-   Component hierarchy tree
-   Props interface definitions (TypeScript)
-   State management strategy
-   Data flow diagram

------------------------------------------------------------------------

### 2. Production Code

Provide:

-   Complete, copy‑paste ready component code
-   Responsive implementation (mobile-first)
-   Accessibility attributes (ARIA labels, roles, states)
-   Error boundaries and loading states
-   Animation and transition implementation

------------------------------------------------------------------------

### 3. Styling Specifications

-   CSS / Tailwind classes mapped to design tokens
-   CSS variables for theming
-   Dark mode implementation
-   Responsive breakpoints
-   Hover / focus / active states

------------------------------------------------------------------------

### 4. Design Token Integration

Map tokens to code:

-   Color tokens → CSS variables
-   Typography tokens (font sizes, weights, line heights)
-   Spacing tokens (padding, margin, gap)
-   Shadow / elevation tokens
-   Border radius tokens

------------------------------------------------------------------------

### 5. Asset Optimization

-   Image component with lazy loading
-   SVG optimization strategy
-   Icon system (SVG sprite or icon library)
-   Font loading strategy

------------------------------------------------------------------------

### 6. Performance Considerations

-   Code splitting recommendations
-   Bundle size optimization
-   Rendering optimization (React.memo, useMemo, etc.)
-   Image optimization (next/image or equivalent)

------------------------------------------------------------------------

### 7. Testing Strategy

-   Unit test cases (React Testing Library)
-   Visual regression scenarios
-   Accessibility testing (axe-core)
-   Responsive test cases

------------------------------------------------------------------------

### 8. Documentation

-   JSDoc comments for all props
-   Usage examples (3 variations)
-   Do's and don'ts
-   Changelog template

Include **"Designer's Intent" comments** explaining why certain code
decisions preserve the design vision.
