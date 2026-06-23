# Gitgram Commands Reference

Quick reference for all available commands in the Gitgram monorepo.

## 🚀 Development

### Main Commands
```bash
npm run dev          # Start backend + web (recommended)
npm run dev:all      # Start backend + web + mobile
npm start            # Start production servers
```

### Individual Projects
```bash
npm run dev:backend  # Backend only (port 3000)
npm run dev:web      # Web only (port 3001)
npm run dev:mobile   # Mobile (Expo)
```

### Using Scripts
```bash
./scripts/dev.sh     # Backend + Web
./scripts/dev-all.sh # All projects
./scripts/start.sh   # Production (auto-builds)
```

## 📦 Installation

```bash
npm run install:all      # Install all projects
npm run install:backend  # Backend only
npm run install:mobile  # Mobile only
npm run install:web     # Web only
```

Or use script:
```bash
./scripts/install-all.sh
```

## 🏗️ Build

```bash
npm run build        # Build backend + web
npm run build:all    # Build all projects
npm run build:backend
npm run build:web
npm run build:mobile
```

## 🧪 Testing

```bash
npm test            # Run all tests
npm run test:backend
npm run test:mobile
npm run test:watch  # Watch mode
```

## 🔍 Linting

```bash
npm run lint        # Check all
npm run lint:fix    # Fix all
npm run lint:backend
npm run lint:mobile
npm run lint:web
```

## 🗄️ Database

```bash
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio
```

## 📦 Package Management

### Add Package
```bash
npm run add:backend <package>
npm run add:mobile <package>
npm run add:web <package>
```

Or use script:
```bash
./scripts/add-package.sh backend express
./scripts/add-package.sh mobile react-native-vector-icons
./scripts/add-package.sh web next-auth
```

### Remove Package
```bash
npm run remove:backend <package>
npm run remove:mobile <package>
npm run remove:web <package>
```

Or use script:
```bash
./scripts/remove-package.sh backend express
```

## 🧹 Cleanup

```bash
npm run clean       # Clean build artifacts
npm run clean:all   # Clean everything
```

Or use script:
```bash
./scripts/clean-all.sh
```

## 📝 Quick Workflow

1. **First time setup:**
   ```bash
   npm run install:all
   npm run prisma:generate
   npm run prisma:migrate
   ```

2. **Daily development:**
   ```bash
   npm run dev
   ```

3. **Production deployment:**
   ```bash
   npm run build
   npm start
   ```

## 🔗 Server URLs

- **Backend API:** http://localhost:3000
- **Web App:** http://localhost:3001
- **Mobile:** Expo DevTools (check terminal)

## 💡 Tips

- Use `npm run dev` for most development work
- Use `npm run dev:all` only when you need mobile too
- Production servers require builds first (`npm run build`)
- All scripts support Ctrl+C to stop servers
- Check individual project READMEs for project-specific commands

