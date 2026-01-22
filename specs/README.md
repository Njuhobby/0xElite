# Specifications

This directory contains project specifications using the **web-app** structure.

## Structure: web-app

Standard web application specifications for REST APIs, databases, and system architecture

## Spec Types

- **capabilities/** - Behavioral requirements with structured scenarios (WHEN/THEN/AND)
- **data-models/** - Database schemas with entities, fields, constraints, and relationships
- **api/** - REST/GraphQL endpoint definitions with request/response formats
- **architecture/** - System design, components, and architectural decision records (ADRs)

## Organization

Each specification lives in its own subdirectory under the appropriate spec type.
Changes are tracked incrementally in `changes/` until archived.

## Commands

Use these Claude Code slash commands:
- `/bootstrap` - Generate initial specs from code
- `/change` - Create a change proposal
- `/validate` - Validate specs format
- `/archive` - Archive completed changes
