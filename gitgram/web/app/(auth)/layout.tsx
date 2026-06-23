'use client'

import { motion } from 'framer-motion'
import { AnimatedStats } from './components/AnimatedStats'
import { ProjectShowcase } from './components/ProjectShowcase'
import { LiveActivity } from './components/LiveActivity'
import { Testimonials } from './components/Testimonials'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background overflow-hidden">
      {/* Hero Section - Left Side */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-background-light via-background to-background-dark p-12 items-center justify-center overflow-hidden"
      >
        {/* Animated Background Grid */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(rgba(88, 166, 255, 0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(88, 166, 255, 0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }} />
        </div>

        {/* Gradient Orbs */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        {/* Content */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              <span className="text-sm text-foreground-secondary">Join 10,000+ developers</span>
            </div>
            
            <h1 className="text-5xl font-bold text-foreground leading-tight">
              Where Code<br />
              Becomes<br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Community
              </span>
            </h1>
            
            <p className="text-lg text-foreground-secondary leading-relaxed">
              Showcase your projects, discover new tools, and connect with developers from around the world.
            </p>
          </div>

          {/* Animated Stats */}
          <AnimatedStats />

          {/* Feature List */}
          <div className="space-y-3">
            {[
              { icon: '🚀', text: 'Share GitHub projects as social posts' },
              { icon: '🔍', text: 'Discover trending repositories' },
              { icon: '🌍', text: 'Connect with developers globally' },
              { icon: '💼', text: 'Build your coding portfolio' }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3 text-foreground-secondary"
              >
                <span className="text-2xl">{feature.icon}</span>
                <span>{feature.text}</span>
              </motion.div>
            ))}
          </div>

          {/* Project Showcase */}
          <ProjectShowcase />

          {/* Live Activity */}
          <LiveActivity />

          {/* Testimonials */}
          <Testimonials />
        </div>
      </motion.div>

      {/* Auth Form - Right Side */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background-dark"
      >
        <div className="w-full max-w-md">
          {children}
        </div>
      </motion.div>
    </div>
  )
}

