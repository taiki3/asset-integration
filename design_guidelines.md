# G-Method Platform Design Guidelines

## Design Approach
**Selected System:** Carbon Design System (IBM)  
**Rationale:** Purpose-built for data-intensive enterprise applications requiring clarity, scalability, and professional presentation of complex workflows.

**Core Principles:**
- Data clarity over decoration
- Efficient information hierarchy
- Productive workflows with minimal friction
- Systematic consistency across all views

---

## Typography

**Font Family:**
- Primary: IBM Plex Sans (via Google Fonts CDN)
- Monospace: IBM Plex Mono (for data tables, code snippets)

**Type Scale:**
- Page Titles: text-4xl font-light (Dashboard, Project names)
- Section Headers: text-2xl font-normal (Workspace sections)
- Subsection Headers: text-lg font-medium (Resource lists, execution panels)
- Body Text: text-base font-normal (Descriptions, content)
- Labels/Metadata: text-sm font-medium (Form labels, status badges)
- Table Data: text-sm font-normal (Data displays, TSV content)
- Captions: text-xs font-normal (Timestamps, helper text)

---

## Layout System

**Spacing Primitives:**
Primary units: `2, 4, 6, 8, 12, 16, 20, 24`

**Container Strategy:**
- Dashboard: max-w-7xl mx-auto
- Project Workspace: max-w-screen-2xl mx-auto (needs horizontal space for 3-column layout)
- Modals/Dialogs: max-w-2xl
- Report Views: max-w-4xl

**Grid Structure:**
- Dashboard: grid-cols-1 md:grid-cols-2 xl:grid-cols-3 (project cards)
- Workspace: Single row with 3 equal-width columns (lg:grid-cols-3)
- Data Tables: Full-width scrollable containers

**Vertical Rhythm:**
- Section spacing: py-12 to py-16
- Component spacing: space-y-6 to space-y-8
- Form elements: space-y-4

---

## Component Library

### Navigation
- **Top Bar:** Fixed header with breadcrumbs, user menu, global actions
- **Project Selector:** Dropdown for quick project switching
- Height: h-16, minimal with focus on content

### Cards (Project Dashboard)
- Border style with subtle shadows
- Hover state: gentle lift effect
- Content: Title, description, metadata (date), action button
- Aspect ratio: Natural height based on content

### Workspace Sections (3-Column Layout)
**① Resource Configuration (Left Column):**
- Accordion/collapsible panels for each resource type
- Upload zones: Dashed border, drag-and-drop enabled
- Resource list: Compact table with name, date, preview action
- Preview panel: Modal with syntax-highlighted content

**② Execution Panel (Center Column):**
- Clean form layout with generous spacing
- Select dropdowns: Full-width, searchable if many options
- Primary action button: Large, prominent
- Real-time status indicator during execution

**③ History & Outputs (Right Column):**
- Timeline/list view of executions
- Status badges: Processing (animated), Completed (success), Error (warning)
- Expandable rows to reveal step-by-step reports
- Download button: Secondary style with icon

### Data Tables
- Zebra striping for rows
- Fixed header on scroll
- Column sorting indicators
- Compact row height (h-10 to h-12)
- Monospace font for numerical data

### Forms
- Stacked label-above-input layout
- Input fields: border with focus ring
- Helper text below inputs
- Validation states: Success/error with inline icons

### Modals
- Backdrop overlay with blur
- Centered, max-width constrained
- Header with title and close icon
- Footer with action buttons (Cancel/Confirm)

### Status Indicators
- Badge components for: Processing, Completed, Error, Pending
- Icon + text combination
- Consistent sizing: px-3 py-1 text-sm

### Buttons
**Primary:** Filled background for main actions ("Create Project", "Run G-Method")  
**Secondary:** Outlined for secondary actions ("Cancel", "View Details")  
**Ghost:** Text-only for tertiary actions (table row actions)  
**Icon buttons:** For compact actions (download, delete, preview)

**Sizes:** Small (h-8), Default (h-10), Large (h-12)

### Icons
**Library:** Heroicons (outline and solid variants via CDN)  
**Usage:**
- Navigation: outline-home, outline-folder, outline-cog
- Actions: outline-plus, outline-play, outline-download, outline-trash
- Status: outline-clock, outline-check-circle, outline-exclamation-circle
- Files: outline-document-text, outline-table-cells

### Loading States
- Skeleton screens for data loading
- Spinner for action processing
- Progress bar for multi-step execution (Steps 2-5)

### Report Display
- Prose container for long-form content
- Syntax highlighting for code blocks
- Collapsible sections for each step
- Copy-to-clipboard functionality for outputs

---

## Animations
**Minimal, Purposeful Only:**
- Button hover: subtle scale (transform scale-105)
- Card hover: shadow elevation transition
- Processing status: gentle pulse animation
- Page transitions: fade-in only (no slides)
- Modal entrance: fade + scale from 95%

**Duration:** 150ms to 200ms (fast, responsive feel)

---

## Images
**Not Applicable:** This is a data-centric enterprise application. No hero images or marketing imagery. Focus is on data visualization, tables, and form interfaces. Any visual elements should be icons, status indicators, or data charts (if needed for future enhancements).