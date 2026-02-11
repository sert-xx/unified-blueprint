# Contributing to UBP

Thank you for your interest in contributing to UBP (Unified Blueprint)!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run test suite |
| `npm run test:watch` | Watch mode testing |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format with Prettier |
| `npm run typecheck` | Type checking |

## Branch Strategy

- Create feature branches from `main`
- Use descriptive branch names: `feat/xxx`, `fix/xxx`, `docs/xxx`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `chore:` Maintenance tasks
- `test:` Adding or updating tests
- `refactor:` Code refactoring

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with appropriate tests
4. Ensure all checks pass: `npm test && npm run lint && npm run typecheck`
5. Submit a pull request with a clear description

## Code Style

- TypeScript with strict mode enabled
- ES Modules (ESM)
- Tests with Vitest
- Format with Prettier before committing

## Reporting Issues

Use [GitHub Issues](https://github.com/sert-xx/unified-blueprint/issues) to report bugs or request features.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
