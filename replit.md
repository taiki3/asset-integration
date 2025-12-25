# G-Method Platform

## Overview
A web application for automating the "G-Method" business hypothesis generation process. Users can create projects, register input resources (target specifications and technical assets), and run a multi-step AI pipeline to generate and evaluate business hypotheses.

## Project Architecture

### Frontend (React + TypeScript)
- **Framework**: React with Vite, TypeScript, TanStack Query
- **Styling**: Tailwind CSS with shadcn/ui components
- **Routing**: wouter
- **Key Pages**:
  - `/` - Dashboard with project list
  - `/projects/:id` - Project workspace with 3-section layout

### Backend (Node.js + Express)
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Integration**: Google Gemini via Replit AI Integrations

### Database Schema
- **projects**: Project management (id, name, description, createdAt)
- **resources**: Input data storage (id, projectId, type, name, content, createdAt)
  - Types: `target_spec` (target specifications) and `technical_assets` (technical asset lists)
- **hypothesis_runs**: G-Method execution history (id, projectId, targetSpecId, technicalAssetsId, status, step outputs, integratedList)

## G-Method Pipeline
The pipeline consists of 4 steps (numbered 2-5):

### Step 2 - Three-Phase Deep Research Architecture
Step 2 uses a sophisticated 3-phase parallel architecture:
1. **Step 2-1 (発散・選定)**: One AI generates 30+ hypotheses and selects Top N using I/M/L/U criteria (weights: I:40%, M:30%, L:15%, U:15%)
2. **Step 2-2 (個別深掘り)**: N separate Deep Research tasks run sequentially (rate limit: 1 req/min with 60s delay between each). Each AI analyzes one hypothesis in depth.
3. **Step 2-3 (統合)**: Gemini 3.0 Pro merges all N individual reports into a unified final report. Reports are summarized before merging to stay within token limits.

Key implementation details:
- `extractHypothesesFromStep2_1()`: Robust parser with multi-attempt extraction, regex fallback, and strict count validation
- `summarizeReportForMerge()`: Reduces each report to 800-1200 chars before merging
- `mergeIndividualReports()`: Combines summaries using Gemini 3.0 Pro with reference deduplication
- Rate limiting: 60-second delay after each Deep Research completion

### Other Steps
2. **Step 3 - Scientific Evaluation**: Evaluate hypotheses for scientific and economic validity
3. **Step 4 - Strategic Audit**: Assess competitive catch-up difficulty and make/buy decisions
4. **Step 5 - Integration**: Generate final TSV data with all hypothesis information

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Get single project
- `POST /api/projects` - Create project
- `DELETE /api/projects/:id` - Delete project

### Resources
- `GET /api/projects/:projectId/resources` - List resources for project
- `POST /api/projects/:projectId/resources` - Create resource
- `DELETE /api/projects/:projectId/resources/:id` - Delete resource

### Hypothesis Runs
- `GET /api/projects/:projectId/runs` - List runs for project
- `POST /api/projects/:projectId/runs` - Start new run
- `GET /api/runs/:id` - Get run details
- `GET /api/runs/:id/download?format=tsv|xlsx` - Download results

## Running the Application
```bash
npm run dev        # Start development server
npm run db:push    # Push database schema changes
```

## Key Files
- `shared/schema.ts` - Database schema and TypeScript types
- `server/routes.ts` - API route definitions
- `server/storage.ts` - Database operations
- `server/gmethod-pipeline.ts` - G-Method AI pipeline execution
- `server/prompts.ts` - Gemini prompts for each step
- `client/src/pages/Dashboard.tsx` - Main dashboard
- `client/src/pages/ProjectWorkspace.tsx` - Project workspace

## Design System
- Typography: IBM Plex Sans (body), IBM Plex Mono (code/data)
- Uses Carbon Design System principles for data-intensive enterprise applications
- Dark mode support via theme toggle
