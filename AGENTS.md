# Sim - AI Agent Workflows Platform

This file contains essential information for AI coding agents working on the Sim project.

## Project Overview

Sim is a visual workflow builder for AI agents. It allows users to design agent workflows on a canvas, connecting blocks (agents, tools, triggers) and deploying them instantly. The platform features a Copilot for natural language workflow generation, vector database integration for knowledge retrieval, and extensive third-party integrations.

**Key Links:**
- Main Website: https://sim.ai
- Documentation: https://docs.sim.ai
- Discord: https://discord.gg/Hr4UWYEcTT

## Technology Stack

- **Framework**: Next.js 16.x (App Router, React 19.x)
- **Runtime**: Bun 1.3.3+ (primary), Node.js 20+ (supported)
- **Monorepo**: Turborepo 2.8.0
- **Database**: PostgreSQL 17 with pgvector extension
- **ORM**: Drizzle ORM 0.44.5
- **Authentication**: Better Auth 1.3.12
- **UI**: Shadcn UI, Radix UI primitives, Tailwind CSS 3.4
- **State Management**: Zustand 4.5.7 with devtools middleware
- **Flow Editor**: ReactFlow 11.x
- **Query Client**: TanStack React Query 5.90+
- **Testing**: Vitest 3.0.8
- **Linting/Formatting**: Biome 2.0.0-beta.5
- **Documentation**: Fumadocs 16.2.3
- **Realtime**: Socket.io 4.8.1
- **Background Jobs**: Trigger.dev 4.1.2
- **Remote Code Execution**: E2B 2.0.0

## Project Structure

```
/home/bart/RefiStudio/
├── apps/
│   ├── sim/                    # Main Next.js application
│   │   ├── app/                # Next.js app router
│   │   │   ├── api/            # API routes
│   │   │   ├── (auth)/         # Auth group routes
│   │   │   ├── (landing)/      # Landing pages
│   │   │   ├── workspace/      # Main app workspace
│   │   │   ├── chat/           # Chat interface
│   │   │   └── ...
│   │   ├── blocks/             # Block definitions and registry
│   │   │   ├── blocks/         # Individual block configs (~100+ blocks)
│   │   │   ├── registry.ts     # Block registry
│   │   │   └── types.ts        # Block type definitions
│   │   ├── components/         # Shared UI components
│   │   │   ├── ui/             # shadcn components
│   │   │   ├── emcn/           # Extended components
│   │   │   └── icons.tsx       # All icon components
│   │   ├── executor/           # Workflow execution engine
│   │   ├── hooks/              # React hooks (queries, selectors)
│   │   ├── lib/                # App-wide utilities
│   │   ├── providers/          # LLM provider integrations (OpenAI, Anthropic, etc.)
│   │   ├── stores/             # Zustand stores (20+ stores)
│   │   ├── tools/              # Tool definitions (100+ integrations)
│   │   ├── triggers/           # Trigger definitions (webhooks, scheduled)
│   │   ├── socket/             # Realtime socket server
│   │   └── ...
│   └── docs/                   # Fumadocs documentation site
│
├── packages/
│   ├── db/                     # Database schema and migrations (Drizzle)
│   ├── logger/                 # Shared logging utilities (@sim/logger)
│   ├── testing/                # Shared testing utilities (@sim/testing)
│   ├── tsconfig/               # Shared TypeScript configs (@sim/tsconfig)
│   ├── ts-sdk/                 # TypeScript SDK (simstudio-ts-sdk)
│   ├── python-sdk/             # Python SDK
│   └── cli/                    # CLI package (simstudio npm package)
│
├── docker/                     # Dockerfiles for services
├── helm/                       # Kubernetes Helm charts
├── scripts/                    # Build and utility scripts
└── .github/workflows/          # CI/CD workflows
```

## Build and Development Commands

All commands run from repository root:

```bash
# Install dependencies
bun install

# Development
bun run dev              # Start main app (port 3000)
bun run dev:sockets      # Start realtime socket server (port 3002)
bun run dev:full         # Start both app and socket server

# Build
bun run build            # Build all packages and apps

# Testing
bun run test             # Run all tests
bun run test:watch       # Run tests in watch mode
bun run test:coverage    # Run tests with coverage

# Code Quality
bun run format           # Format all code with Biome
bun run format:check     # Check formatting
bun run lint             # Lint and auto-fix with Biome
bun run lint:check       # Check linting
bun run type-check       # Type-check all packages

# Database (in packages/db/)
cd packages/db && bunx drizzle-kit migrate  # Run migrations
bunx drizzle-kit studio                     # Open Drizzle Studio
bunx drizzle-kit push                       # Push schema changes
```

### Troubleshooting: "OS file watch limit reached" / "Module not found" in dev

If you see "OS file watch limit reached" or spurious "Module not found" for paths under `node_modules` (e.g. `react`, `next-devtools/userspace/pages`), the system inotify limit is too low. Fix by raising limits:

**On the host (bare metal / VM):**

```bash
# Temporary (until reboot)
sudo sysctl fs.inotify.max_user_watches=524288
sudo sysctl fs.inotify.max_user_instances=512

# Persistent (Linux): create e.g. /etc/sysctl.d/99-inotify.conf
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.d/99-inotify.conf
echo "fs.inotify.max_user_instances=512"   | sudo tee -a /etc/sysctl.d/99-inotify.conf
sudo sysctl -p /etc/sysctl.d/99-inotify.conf
```

**In Docker:** pass sysctls when running the container, e.g. `--sysctl fs.inotify.max_user_watches=524288` or set in `docker-compose.yml` under the service: `sysctls: - fs.inotify.max_user_watches=524288`.

## Environment Variables

Required environment variables for self-hosted deployments:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string with pgvector |
| `BETTER_AUTH_SECRET` | Yes | Auth secret (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | Yes | Your app URL (e.g., `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL |
| `ENCRYPTION_KEY` | Yes | Encrypts environment variables |
| `INTERNAL_API_SECRET` | Yes | Encrypts internal API routes |
| `API_ENCRYPTION_KEY` | Yes | Encrypts API keys |
| `REDIS_URL` | No | Redis for session scaling |
| `COPILOT_API_KEY` | No | API key from sim.ai for Copilot features |
| `OLLAMA_URL` | No | URL for local Ollama server |
| `DISABLE_AUTH` | No | Set to `true` to bypass authentication (private networks) |

See `apps/sim/.env.example` for full list.

## Code Style Guidelines

### Import Rules
- **Always use absolute imports** with `@/` prefix
- Never use relative imports like `../../../stores/...`
- Use barrel exports (`index.ts`) when a folder has 3+ exports
- Import order: React/core → External libs → UI components → Utilities → Stores → Features → CSS

```typescript
// ✓ Good
import { useWorkflowStore } from '@/stores/workflows/store'

// ✗ Bad
import { useWorkflowStore } from '../../../stores/workflows/store'
```

### Naming Conventions
- Components: PascalCase (`WorkflowList`)
- Hooks: `use` prefix (`useWorkflowOperations`)
- Files: kebab-case (`workflow-list.tsx`)
- Stores: `stores/feature/store.ts`
- Constants: SCREAMING_SNAKE_CASE
- Interfaces: PascalCase with suffix (`WorkflowListProps`)

### TypeScript Standards
- No `any` - use proper types or `unknown` with type guards
- Always define props interface for components
- Use `as const` for constant objects/arrays
- Explicit ref types: `useRef<HTMLDivElement>(null)`
- Use `import type { X }` for type-only imports

### Component Structure
```typescript
'use client' // Only if using hooks

const CONFIG = { SPACING: 8 } as const

interface ComponentProps {
  requiredProp: string
  optionalProp?: boolean
}

export function Component({ requiredProp, optionalProp = false }: ComponentProps) {
  // Order: refs → external hooks → store hooks → custom hooks → state → useMemo → useCallback → useEffect → return
}
```

### Logging
Import `createLogger` from `@sim/logger`. Use `logger.info`, `logger.warn`, `logger.error` instead of `console.log`.

### Comments
- Use TSDoc for documentation
- No `====` separators
- No non-TSDoc comments

### Styling
- Use Tailwind only, no inline styles
- Use `cn()` from `@/lib/utils` for conditional classes
- Never update global styles - keep all styling local to components
- Import EMCN components from `@/components/emcn`, never from subpaths

## Testing Instructions

Tests use Vitest with the following patterns:

```typescript
/**
 * @vitest-environment node
 */
import { databaseMock, loggerMock } from '@sim/testing'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sim/db', () => databaseMock)
vi.mock('@sim/logger', () => loggerMock)

import { myFunction } from '@/lib/feature'

describe('feature', () => {
  beforeEach(() => vi.clearAllMocks())
  it.concurrent('runs in parallel', () => { ... })
})
```

Use `@sim/testing` mocks/factories over local test data:
- `createBlock()`, `createStarterBlock()` - Block factories
- `createLinearWorkflow(n)` - Workflow factories
- `WorkflowBuilder.branching()` - Complex workflow builders
- `databaseMock`, `loggerMock` - Common mocks

Test files should be co-located: `feature.ts` → `feature.test.ts`

## Adding New Integrations

New integrations require: **Tools** → **Block** → **Icon** → (optional) **Trigger**

### 1. Create Tool (`tools/{service}/`)

```typescript
// tools/{service}/index.ts - Barrel export
// tools/{service}/types.ts - Type definitions
// tools/{service}/{action}.ts - Tool implementations

export const serviceTool: ToolConfig<Params, Response> = {
  id: 'service_action',
  name: 'Service Action',
  description: '...',
  version: '1.0.0',
  oauth: { required: true, provider: 'service' },
  params: { /* ... */ },
  request: { url: '/api/tools/service/action', method: 'POST' },
  transformResponse: async (response) => { /* ... */ },
  outputs: { /* ... */ },
}
```

Register in `tools/registry.ts`.

### 2. Create Block (`blocks/blocks/{service}.ts`)

```typescript
export const ServiceBlock: BlockConfig = {
  type: 'service',
  name: 'Service',
  description: '...',
  category: 'tools',
  bgColor: '#hexcolor',
  icon: ServiceIcon,
  subBlocks: [ /* see SubBlock properties */ ],
  tools: { access: ['service_action'], config: { tool: (p) => `service_${p.operation}` } },
  inputs: { /* ... */ },
  outputs: { /* ... */ },
}
```

Register in `blocks/registry.ts` (alphabetically).

### 3. Add Icon (`components/icons.tsx`)

```typescript
export function ServiceIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...props}>{/* SVG from brand assets */}</svg>
}
```

### 4. (Optional) Create Trigger (`triggers/{service}/`)

Register in `triggers/registry.ts`.

## Security Considerations

- All API routes use `INTERNAL_API_SECRET` for internal authentication
- Environment variables encrypted with `ENCRYPTION_KEY`
- API keys encrypted with `API_ENCRYPTION_KEY`
- CSP headers configured in `next.config.ts`
- CORS properly configured for API routes
- Form embedding uses permissive CORS but with origin validation
- OAuth credentials stored encrypted in database

## Deployment Options

### Docker Compose (Recommended for Self-Hosted)
```bash
docker compose -f docker-compose.prod.yml up -d
```

### With Local Ollama Models
```bash
docker compose -f docker-compose.ollama.yml --profile setup up -d
```

### NPM Package
```bash
npx simstudio
```

### Kubernetes (Helm)
Helm charts available in `helm/sim/` directory.

## CI/CD Pipeline

- **Branching**: PRs target `staging` branch, releases go to `main`
- **Testing**: Automated tests on all PRs via `test-build.yml`
- **Docker Images**: Built for AMD64 (ECR + GHCR) and ARM64 (GHCR only)
- **Releases**: Version commits (e.g., `v0.5.24: ...`) trigger GitHub releases
- **Linting**: Biome checks must pass before merge

## Common Development Tasks

### Add a New Block Category
Update `blocks/categories.ts` with new category metadata.

### Add a New Provider Integration
1. Create tool in `tools/{provider}/`
2. Create block in `blocks/blocks/{provider}.ts`
3. Add icon to `components/icons.tsx`
4. Register in respective registry files

### Database Schema Changes
1. Modify schema in `packages/db/schema.ts`
2. Run `bunx drizzle-kit generate` to create migration
3. Run `bunx drizzle-kit migrate` to apply

### Add a New Store
Create in `stores/{feature}/store.ts` with `devtools` middleware:

```typescript
export const useFeatureStore = create<FeatureState>()(
  devtools((set, get) => ({ ... }), { name: 'feature-store' })
)
```

## License

Apache License 2.0 - See LICENSE file for details.
