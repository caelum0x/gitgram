# 🎨 Component Usage Guide

## 📦 Available Components

### 1. Input Component

**Location**: `components/ui/input.tsx`

#### Basic Usage
```tsx
import { Input } from '@/components/ui/input'

<Input
  label="Email"
  type="email"
  placeholder="you@example.com"
/>
```

#### With Icon
```tsx
<Input
  label="Email"
  type="email"
  icon={
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  }
/>
```

#### With Error
```tsx
<Input
  label="Email"
  type="email"
  error="Invalid email address"
/>
```

#### Features
- ✅ Floating label animation
- ✅ Icon support (left side)
- ✅ Error state with message
- ✅ Focus ring animation
- ✅ Accessible (ARIA labels)

---

### 2. Button Component

**Location**: `components/ui/button.tsx`

#### Variants

**Primary (Green Gradient)**
```tsx
<Button variant="primary">
  Sign in
</Button>
```

**Secondary (Outlined)**
```tsx
<Button variant="secondary">
  Cancel
</Button>
```

**Ghost (Transparent)**
```tsx
<Button variant="ghost">
  Learn more
</Button>
```

**GitHub (Black)**
```tsx
<Button variant="github">
  Continue with GitHub
</Button>
```

#### Sizes

```tsx
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
```

#### With Loading
```tsx
<Button loading={isLoading}>
  {isLoading ? 'Signing in...' : 'Sign in'}
</Button>
```

#### With Icon
```tsx
<Button
  icon={
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0.5C5.37 0.5..." />
    </svg>
  }
>
  GitHub
</Button>
```

#### Features
- ✅ 4 variants (primary, secondary, ghost, github)
- ✅ 3 sizes (sm, md, lg)
- ✅ Loading state with spinner
- ✅ Icon support
- ✅ Hover/tap animations
- ✅ Disabled state

---

### 3. Password Strength Meter

**Location**: `components/ui/password-strength.tsx`

#### Usage
```tsx
import { PasswordStrength } from '@/components/ui/password-strength'

const [password, setPassword] = useState('')

<Input
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
<PasswordStrength password={password} />
```

#### Strength Levels
- **Weak** (Red): 0-2 points
- **Fair** (Yellow): 3 points
- **Good** (Blue): 4 points
- **Strong** (Green): 5 points

#### Scoring
- Length ≥ 8: +1
- Length ≥ 12: +1
- Mixed case: +1
- Numbers: +1
- Special chars: +1

#### Features
- ✅ Real-time calculation
- ✅ Animated progress bars
- ✅ Color-coded feedback
- ✅ Visual strength label

---

### 4. Animated Stats

**Location**: `app/(auth)/components/AnimatedStats.tsx`

#### Usage
```tsx
import { AnimatedStats } from './components/AnimatedStats'

<AnimatedStats />
```

#### Display
```
10K+ Developers
50K+ Projects
1M+ Stars
```

#### Features
- ✅ Counting animation (0 to target)
- ✅ Number formatting (K, M)
- ✅ Staggered entrance
- ✅ 2-second duration

---

### 5. Project Showcase

**Location**: `app/(auth)/components/ProjectShowcase.tsx`

#### Usage
```tsx
import { ProjectShowcase } from './components/ProjectShowcase'

<ProjectShowcase />
```

#### Projects
1. awesome-app (TypeScript, 1337⭐)
2. cool-project (JavaScript, 892⭐)
3. next-gen-ui (React, 2456⭐)
4. api-gateway (Go, 567⭐)

#### Features
- ✅ Auto-rotation (3s interval)
- ✅ Language color indicators
- ✅ Star counts
- ✅ Progress dots
- ✅ Smooth transitions

---

## 🎨 Styling Patterns

### Glassmorphism Card
```tsx
<div className="bg-surface/50 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl">
  {/* Content */}
</div>
```

### Gradient Button
```tsx
<button className="bg-gradient-to-r from-accent to-accent-hover text-white rounded-xl px-6 py-3 font-semibold hover:shadow-lg hover:shadow-accent/20">
  Click me
</button>
```

### Gradient Text
```tsx
<h1 className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
  Gradient Text
</h1>
```

### Focus Ring
```tsx
<input className="focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
```

---

## 🎭 Animation Patterns

### Page Entrance
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
  {/* Content */}
</motion.div>
```

### Button Hover
```tsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
>
  Click me
</motion.button>
```

### Floating Animation
```tsx
<motion.div
  animate={{ y: [0, -10, 0] }}
  transition={{ duration: 3, repeat: Infinity }}
>
  {/* Content */}
</motion.div>
```

### Staggered List
```tsx
{items.map((item, i) => (
  <motion.div
    key={i}
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: i * 0.1 }}
  >
    {item}
  </motion.div>
))}
```

---

## 🎯 Common Patterns

### Form Field
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium text-foreground">
    Email
  </label>
  <Input type="email" />
</div>
```

### Error Message
```tsx
<motion.div
  initial={{ opacity: 0, x: -10 }}
  animate={{ opacity: 1, x: 0 }}
  className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-xl text-sm"
>
  Error message
</motion.div>
```

### Loading Spinner
```tsx
<svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
</svg>
```

---

## 📱 Responsive Utilities

### Hide on Mobile
```tsx
<div className="hidden lg:flex">
  Desktop only
</div>
```

### Show on Mobile
```tsx
<div className="lg:hidden">
  Mobile only
</div>
```

### Responsive Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Items */}
</div>
```

---

## 🎨 Color Utilities

```tsx
// Backgrounds
bg-background       // #0A0C10
bg-surface          // #161b22
bg-primary          // #58a6ff
bg-accent           // #238636

// Text
text-foreground              // #c9d1d9
text-foreground-secondary    // #8b949e
text-primary                 // #58a6ff
text-accent                  // #238636

// Borders
border-border       // #30363d
border-primary      // #58a6ff
```

---

## 🔧 Utility Functions

### cn() - Class Name Merger
```tsx
import { cn } from '@/lib/utils'

<div className={cn(
  'base-classes',
  condition && 'conditional-classes',
  className
)} />
```

---

**Happy Coding! 🚀**
