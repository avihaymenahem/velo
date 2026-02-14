import { motion } from 'framer-motion'
import {
  Sparkles, Keyboard, Shield, Inbox, Tag, Clock,
  Search, Calendar, Bell, Mail, Zap, Layout,
  Palette, Filter, BookOpen, BellRing, Server,
} from 'lucide-react'
import { SectionHeader } from './SectionHeader'

const HERO_FEATURES = [
  {
    icon: Sparkles,
    title: 'AI-Powered Intelligence',
    description: 'Thread summaries, smart replies, AI compose, text transforms, and natural language inbox search. Choose from Claude, GPT, or Gemini.',
    gradient: 'from-violet-500/20 to-indigo-500/20',
    span: 'md:col-span-2',
  },
  {
    icon: Keyboard,
    title: 'Keyboard-First Design',
    description: '30+ Superhuman-style shortcuts with two-key sequences, customizable bindings, and a system-wide compose shortcut.',
    gradient: 'from-indigo-500/20 to-blue-500/20',
    span: 'md:col-span-1',
  },
  {
    icon: Shield,
    title: 'Privacy & Security',
    description: 'Local-first SQLite database. Phishing detection with 10 heuristic rules. SPF/DKIM/DMARC verification badges. Remote image blocking.',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    span: 'md:col-span-1',
  },
  {
    icon: Inbox,
    title: 'Split Inbox Categories',
    description: 'Auto-sort into Primary, Updates, Promotions, Social & Newsletters. Rule-based engine with AI refinement for pinpoint accuracy.',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    span: 'md:col-span-2',
  },
]

const FEATURES_GRID = [
  {
    icon: Server,
    title: 'Multi-Provider',
    description: 'Gmail API + IMAP/SMTP. Auto-discover Outlook, Yahoo, iCloud, Fastmail, and more.',
  },
  {
    icon: Clock,
    title: 'Snooze & Schedule',
    description: 'Snooze threads to resurface later. Schedule sends with quick presets.',
  },
  {
    icon: Search,
    title: 'Powerful Search',
    description: 'Gmail-style operators with instant FTS5 local search and command palette.',
  },
  {
    icon: Filter,
    title: 'Smart Filters',
    description: 'Auto-apply labels, archive, star, or trash based on custom criteria.',
  },
  {
    icon: Tag,
    title: 'Labels & Smart Folders',
    description: 'Color-coded labels and saved search queries with dynamic date tokens.',
  },
  {
    icon: Zap,
    title: 'Quick Steps',
    description: 'Chain up to 18 action types into single-click automation workflows.',
  },
  {
    icon: Calendar,
    title: 'Google Calendar',
    description: 'Day, week, and month views. Create events right from your inbox.',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Category-filtered alerts with VIP senders who always get through.',
  },
  {
    icon: Mail,
    title: 'Rich Composer',
    description: 'TipTap rich text editor, signatures, templates, undo send, and draft auto-save.',
  },
  {
    icon: Layout,
    title: 'Flexible Layout',
    description: 'Right, bottom, or hidden reading pane. Resizable panels. Pop-out windows.',
  },
  {
    icon: BellRing,
    title: 'Follow-Up Reminders',
    description: 'Get notified when replies are missing. Auto-dismiss when they arrive.',
  },
  {
    icon: BookOpen,
    title: 'Newsletter Bundles',
    description: 'Group newsletters by sender with scheduled daily or weekly delivery.',
  },
  {
    icon: Palette,
    title: 'Stunning Themes',
    description: '8 accent colors, light & dark mode, font scaling, and adjustable email density.',
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 md:py-32 px-6 relative z-10">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          badge="Features"
          title="Everything you need."
          highlight="Nothing you don't."
          description="130+ features crafted for speed, privacy, and productivity. Here are the highlights."
        />

        {/* Hero Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {HERO_FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className={`glass-card p-6 md:p-8 ${feature.span} relative overflow-hidden group`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {/* Gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

              <div className="relative z-10">
                <div className="feature-icon mb-4">
                  <feature.icon size={22} />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-text-primary">{feature.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Smaller Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {FEATURES_GRID.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="glass-card p-5 group"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <div className="feature-icon mb-3 !w-10 !h-10">
                <feature.icon size={18} />
              </div>
              <h3 className="text-sm font-semibold mb-1.5 text-text-primary">{feature.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
