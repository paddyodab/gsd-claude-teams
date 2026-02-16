# gsd-claude-teams

A thin adaptation layer for [Get Shit Done](https://github.com/glittercowboy/get-shit-done) that makes GSD plans executable by multiple developers.

**Status:** Research / design phase. Not usable yet.

## The Problem

GSD produces excellent plans committed to `.planning/` in your repo. But execution assumes a single developer — `STATE.md` tracks one person's position, there's no ownership model, and no handoff convention. Developer B can't pick up Phase 3 while Developer A executes Phase 2.

## Approach

Following the [gsd-opencode](https://github.com/rokicool/gsd-opencode) adaptation pattern:

- `original/get-shit-done/` — GSD as a git submodule (never modified directly)
- `adapted/` — Transformed copies of GSD workflows with team-aware state paths
- `commands/` — Wrapper skills for team coordination (assign, handoff, status, pickup)
- `scripts/` — Build/transform tooling that rewrites GSD prompts for team use

## Key Design Decision

GSD hardcodes `.planning/` paths in ~90 files. Rather than forking, we maintain a build step that transforms the workflow markdown — rewriting state file paths to support per-developer isolation while keeping shared artifacts (ROADMAP.md, PROJECT.md, REQUIREMENTS.md) in the common `.planning/` root.

## Structure

```
gsd-claude-teams/
├── original/get-shit-done/     # git submodule — upstream GSD
├── adapted/                    # transformed GSD workflows (generated, not hand-edited)
├── commands/team/              # wrapper skills: assign, handoff, status, pickup
├── scripts/                    # build tooling for path transformation
└── docs/                       # conventions and design decisions
```
