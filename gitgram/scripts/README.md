# Gitgram Scripts

Utility scripts for managing the Gitgram monorepo.

## Available Scripts

### `install-all.sh`
Installs dependencies for all projects (backend, mobile, web).

```bash
./scripts/install-all.sh
```

### `dev.sh`
Runs backend and web development servers (main development command).

```bash
./scripts/dev.sh
```

### `dev-all.sh`
Runs all development servers (backend, web, and mobile).

```bash
./scripts/dev-all.sh
```

### `start.sh`
Runs production servers (backend and web). Auto-builds if needed.

```bash
./scripts/start.sh
```

### `add-package.sh`
Adds a package to a specific project or all projects.

```bash
# Add to specific project
./scripts/add-package.sh backend express
./scripts/add-package.sh mobile react-native-vector-icons
./scripts/add-package.sh web next-auth

# Add as dev dependency
./scripts/add-package.sh backend jest --dev

# Add to all projects
./scripts/add-package.sh all axios
```

### `remove-package.sh`
Removes a package from a specific project or all projects.

```bash
# Remove from specific project
./scripts/remove-package.sh backend express
./scripts/remove-package.sh mobile react-native-vector-icons

# Remove from all projects
./scripts/remove-package.sh all axios
```

### `clean-all.sh`
Removes all build artifacts, node_modules, and cache files.

```bash
./scripts/clean-all.sh
```

## Making Scripts Executable

If scripts are not executable, run:

```bash
chmod +x scripts/*.sh
```

## Usage Tips

1. Always run scripts from the project root directory
2. Scripts will automatically navigate to the correct directories
3. Use `Ctrl+C` to stop running development servers
4. Check script output for any errors or warnings

