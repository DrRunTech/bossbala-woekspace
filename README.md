# BossBala — AI-Powered Workspace Intelligence

> **BossBala** is an AI-driven management platform that helps university research teams and small businesses track activity, projects, clients, and contracts — with evidence-based AI insights that surface risks before they become problems.

## What is BossBala?

BossBala is your team's **quiet command center**. It unifies project management, activity tracking, file management, and client & contract records into a single workspace — then layers AI on top to analyze the evidence, detect risks, and answer your questions in plain language.

Instead of guessing how your team is doing, you get **evidence-first analysis**: every AI insight cites the real activities, tasks, files, and records behind it. No fabricated progress. No vague dashboards.

## Key Features

- 📊 **Today Dashboard** — KPIs, project progress, activity feeds, and critical AI insights in one view
- 🗂️ **Project & Task Management** — full lifecycle tracking with priorities, dependencies, and milestones
- 👥 **Team & Client Management** — member profiles, client records, and contract tracking for small businesses
- 📁 **Smart File Management** — uploads with automatic AI extraction of metadata, summaries, and chartable datasets
- 📈 **Data Studio** — visualize local or uploaded data (CSV, Excel, JSON, PDF, and more) with AI-assisted extraction
- 🤖 **BossAI Assistant** — ask natural-language questions about your workspace and get cited, evidence-backed answers
- ⚠️ **Automated Risk Detection** — scheduled AI monitoring flags overdue work, stalled projects, and data anomalies
- 🔍 **Period Comparisons** — objective, week-over-week and month-over-month performance metrics
- 🌐 **Bilingual (English / 中文)** — fully localized interface
- 🔐 **Role-Based Access Control** — PI/admin/lead and researcher roles with organization-level data isolation
- 🖥️ **Local AI Option** — connect to your own Ollama models via a secure local gateway, or use cloud models

## Who It's For

- **University research teams** — PIs and lab leads who need visibility into experiments, tasks, and evidence without micromanaging
- **Small businesses** — owners and team leads who want enterprise-grade project and client tracking with AI-driven insights

## Tech Stack

React · Tailwind CSS · Base44 (auth, database, functions, hosting) · Optional local LLM integration (Ollama)

---

## Run and Edit This App (Base44)

Use this repository to run and edit the app locally, then publish changes back through Base44.

Any change pushed to the repo will also be reflected in the Base44 Builder.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.

See the [Base44 CLI docs](https://docs.base44.com/developers/references/cli/get-started/overview) if you want to run Base44 commands directly.

## Run Locally

Run the full local development environment from the project root:

```bash
base44 dev
```

`base44 dev` starts the local Base44 development backend and, when this app is configured for it, also starts the frontend dev server for you. Use the frontend URL printed by the command.

For example, when the Base44 project config includes a `serveCommand`, `base44 dev` can launch the frontend too:

```json5
{
  "site": {
    "serveCommand": "npm run dev"
  }
}
```

In a Base44 project this lives in `base44/config.jsonc`.

## Run Only The Frontend

If you only want to work on the frontend against the hosted Base44 backend, run:

```bash
npm run dev
```

Open the local URL printed by Vite.

## Use The Hosted Backend

For frontend-only development, create or update `.env.local` in the project root:

```bash
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
```

`VITE_BASE44_APP_ID` identifies the Base44 app.

`VITE_BASE44_APP_BASE_URL` tells the Base44 Vite plugin where to send local `/api` requests. Point it at your deployed Base44 app URL when you want the local frontend to use the hosted backend.

When you use `base44 dev`, the command injects the local Base44 values for you, so `.env.local` is mainly needed for frontend-only workflows.

## Publish Your Changes

After pushing your changes to git, open the Base44 dashboard and publish the app:

```bash
base44 dashboard open
```

## Docs & Support

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Base44 CLI command reference: [https://docs.base44.com/developers/references/cli/commands/introduction](https://docs.base44.com/developers/references/cli/commands/introduction)

Support: [https://app.base44.com/support](https://app.base44.com/support)