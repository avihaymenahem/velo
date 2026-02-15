import { motion } from 'framer-motion'
import {
  Zap, Search, Clock, Send, Bell, Calendar,
  Filter, Layers, GripVertical, PenTool, Shield, Palette,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Zap,
    title: 'Quick Steps',
    description: '18 action types to automate repetitive workflows. Archive, label, reply, forward — chain actions into one-click sequences.',
  },
  {
    icon: Search,
    title: 'Command palette',
    description: 'Gmail-style search operators (from:, has:attachment, before:) with fuzzy matching and instant results across all accounts.',
  },
  {
    icon: Clock,
    title: 'Snooze & schedule',
    description: 'Snooze threads to resurface later. Schedule emails to send at the perfect time. Background checkers handle the rest.',
  },
  {
    icon: Send,
    title: 'Undo send',
    description: 'Configurable delay window after hitting send. Cancel a message before it actually leaves your outbox.',
  },
  {
    icon: Bell,
    title: 'Smart notifications',
    description: 'OS-native notifications filtered by VIP senders. Only get alerted for the people who matter.',
  },
  {
    icon: Calendar,
    title: 'Calendar integration',
    description: 'Google Calendar built in — view events, create meetings, and manage your schedule without switching apps.',
  },
  {
    icon: Filter,
    title: 'Filters & rules',
    description: 'Auto-apply labels, archive, star, or mark as read. AND-logic criteria with action merging when multiple filters match.',
  },
  {
    icon: Layers,
    title: 'Newsletter bundles',
    description: 'Group newsletter senders into bundles with delivery schedules. Read them on your terms, not theirs.',
  },
  {
    icon: GripVertical,
    title: 'Drag & drop',
    description: 'Drag threads onto sidebar labels to organize instantly. Multi-select and bulk operations for power users.',
  },
  {
    icon: PenTool,
    title: 'Rich composer',
    description: 'TipTap editor with formatting, templates, signatures, attachments, and draft auto-save every 3 seconds.',
  },
  {
    icon: Shield,
    title: 'Phishing detection',
    description: '10 heuristic rules — homograph attacks, URL shorteners, display mismatch, brand impersonation. Configurable sensitivity.',
  },
  {
    icon: Palette,
    title: 'Themes & density',
    description: '8 accent colors, light & dark mode, 4 density levels, adjustable font scaling. Make it yours.',
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06 },
  }),
}

export function Features() {
  return (
    <section className="relative py-24 md:py-32 px-6 dot-grid">
      {/* Fade edges */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-bg-primary to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-bg-primary to-transparent pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight mb-4">
            <span className="gradient-text">Everything</span>
            <span className="text-text-primary"> you'd expect, and more</span>
          </h2>
          <p className="text-text-secondary text-lg max-w-xl mx-auto">
            130+ features built for people who live in their inbox.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="group rounded-xl border border-white/[0.04] p-5 transition-all duration-300 hover:border-white/[0.08] hover:bg-white/[0.02]"
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/15 flex items-center justify-center flex-shrink-0 transition-colors duration-300 group-hover:bg-accent/15 group-hover:border-accent/25">
                  <feature.icon size={17} className="text-accent" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-medium text-text-primary mb-1">{feature.title}</h3>
                  <p className="text-[13px] text-text-secondary leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
