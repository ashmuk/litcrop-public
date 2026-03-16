# ADR-20260317: Frontend Framework Selection

## Status
Accepted

## Context
LitCrop needs a frontend framework for the mobile-first web dashboard. The PoC has 3 screens (Farm Overview, Plot Detail, Image Timeline) with mostly read-heavy, content-focused pages. The dashboard displays images, metadata, and provides simple tagging interactions.

Key requirements:
- Mobile-first responsive design (320-480px primary viewport)
- Fast page loads on 3G (< 3 seconds for Farm Overview)
- Static/SSG-friendly (content changes infrequently, only on image upload)
- Deployable as static files to S3 + CloudFront
- TypeScript support

The existing PR template already references `npx astro check`, indicating upstream tooling expectations.

### Decision Drivers
- Performance: Minimal JavaScript shipped to client; fast load on 3G
- Cost: Static hosting on S3 + CloudFront (cheapest option)
- Simplicity: Small team, 3 screens, content-focused
- Mobile UX: Framework must support responsive design patterns well
- Ecosystem alignment: PR template references `npx astro check`

## Options Considered

### Option A: Astro (with islands)
- **Description**: Content-focused framework that ships zero JavaScript by default. Interactive elements use "islands" (Preact, Svelte, or vanilla JS). Excellent SSG support.
- **Pros**:
  - Ships zero JS by default; interactive islands only where needed
  - Perfect for content-heavy, read-mostly pages (image galleries, metadata display)
  - Built-in image optimization components
  - TypeScript support out of the box
  - SSG mode produces static files ideal for S3 + CloudFront
  - Already referenced in PR template (`npx astro check`)
  - Can use any UI framework for islands (Preact for lightweight interactivity)
  - Excellent Lighthouse scores with minimal effort
- **Cons**:
  - Smaller ecosystem than React/Next.js
  - Island architecture requires thinking about where interactivity lives
  - Less community content and tutorials compared to Next.js
  - Team may need to learn Astro-specific patterns
- **Effort**: Low-Medium

### Option B: Next.js (App Router, static export)
- **Description**: Full-featured React framework with SSG/SSR. Can do static export for S3 hosting.
- **Pros**:
  - Largest ecosystem, most community resources
  - Excellent TypeScript support
  - Mature routing, data fetching patterns
  - Static export mode available
- **Cons**:
  - Ships significant React runtime JS (~80-100KB) even for static pages
  - Static export mode loses many Next.js features (middleware, ISR, API routes)
  - Overkill for 3 mostly-static screens
  - Heavier builds, slower page loads on 3G
  - Vercel-optimized; S3 hosting is a second-class deployment target
- **Effort**: Medium

### Option C: SvelteKit (static adapter)
- **Description**: Svelte-based framework with static adapter for SSG deployment.
- **Pros**:
  - Compiles away the framework; small runtime
  - Good performance characteristics
  - Clean component syntax
  - Static adapter works well
- **Cons**:
  - Smaller ecosystem than React
  - Team would need to learn Svelte
  - Less mature than Next.js for production patterns
  - No specific advantage over Astro for content-focused pages
- **Effort**: Medium

## Decision
We choose **Option A: Astro** with Preact islands for interactive components.

Specifically:
- **Astro** in SSG mode for page structure, routing, and content rendering
- **Preact** islands for interactive elements (tagging buttons, image lightbox, pagination)
- **Vanilla CSS** (or CSS modules) for styling — no CSS framework for PoC
- **TypeScript** throughout

## Consequences

### Positive
- Minimal JavaScript shipped to mobile clients; best possible 3G performance
- Static output deploys directly to S3 + CloudFront at near-zero cost
- Island architecture naturally separates static content from interactive elements
- Aligns with existing PR template tooling (`npx astro check`)
- Preact islands add only ~3KB for interactive components

### Negative / Risks
- Team needs to learn Astro's island architecture pattern
- If the app becomes highly interactive in later phases, may need to reconsider (but islands scale reasonably well)
- Smaller pool of Astro developers for future team growth

### Mitigations
- Astro's learning curve is gentle; syntax is close to HTML + JSX
- Interactive components are standard Preact/React; skills transfer
- If interactivity demands grow significantly at MVP, can migrate island components to a full SPA framework while keeping Astro as the shell

### Rollback Plan
- Astro components are close to standard HTML/JSX; migration to Next.js or SvelteKit is straightforward
- Preact islands can be replaced with React islands with minimal changes
- Static CSS works in any framework

## References
- [Astro Documentation](https://docs.astro.build/)
- [Astro Islands](https://docs.astro.build/en/concepts/islands/)
- PR template line 60: `npx astro check`
- NFR-1.1: Farm Overview load < 3s on 3G
