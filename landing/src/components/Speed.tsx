import { motion } from 'framer-motion'
import { SectionHeader } from './SectionHeader'

const SHORTCUTS = [
  { keys: ['j', 'k'], action: 'Navigate threads', description: 'Move between emails instantly' },
  { keys: ['e'], action: 'Archive', description: 'Remove from inbox, keep searchable' },
  { keys: ['c'], action: 'Compose', description: 'New email in milliseconds' },
  { keys: ['r'], action: 'Reply', description: 'Respond without reaching for the mouse' },
  { keys: ['/'], action: 'Search', description: 'Command palette with operators' },
  { keys: ['g', 'i'], action: 'Go to Inbox', description: 'Two-key sequence navigation' },
  { keys: ['s'], action: 'Star', description: 'Flag important threads' },
  { keys: ['#'], action: 'Trash', description: 'Delete with a single keystroke' },
  { keys: ['Ctrl', 'Enter'], action: 'Send', description: 'Fire off your reply' },
  { keys: ['?'], action: 'Help', description: 'See all shortcuts anytime' },
]

const SPEED_FEATURES = [
  {
    title: 'Local-First Database',
    description: 'SQLite with FTS5 full-text search. Every query runs on your machine, not a remote server.',
    metric: '<10ms',
    metricLabel: 'search latency',
  },
  {
    title: 'Background Sync',
    description: 'Delta sync every 60 seconds — Gmail History API or IMAP UID tracking. Full sync fallback when needed.',
    metric: '60s',
    metricLabel: 'sync interval',
  },
  {
    title: 'Smart Caching',
    description: 'AI results, attachments, and tokens cached locally. Zero redundant network calls.',
    metric: '0',
    metricLabel: 'wasted API calls',
  },
]

export function Speed() {
  return (
    <section id="speed" className="py-24 md:py-32 px-6 relative z-10">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          badge="Speed"
          title="Built for people who"
          highlight="type faster than they click"
          description="Every action has a keyboard shortcut. Two-key sequences for navigation. Customizable bindings for everything."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {/* Keyboard Shortcuts Visual */}
          <motion.div
            className="glass-card p-6 md:p-8 overflow-hidden"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-lg font-semibold mb-6 text-text-primary">Keyboard Shortcuts</h3>
            <div className="space-y-3">
              {SHORTCUTS.map((shortcut, i) => (
                <motion.div
                  key={shortcut.action}
                  className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex items-center gap-1.5 min-w-[80px]">
                    {shortcut.keys.map((key, ki) => (
                      <span key={ki}>
                        <span className="kbd">{key}</span>
                        {ki < shortcut.keys.length - 1 && (
                          <span className="text-text-muted text-xs mx-0.5">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-text-primary">{shortcut.action}</span>
                    <span className="text-xs text-text-muted ml-2 hidden sm:inline">{shortcut.description}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-text-muted">
                All shortcuts are fully customizable in Settings. Supports two-key sequences with 1-second timeout.
              </p>
            </div>
          </motion.div>

          {/* Speed Metrics */}
          <div className="flex flex-col gap-4">
            {SPEED_FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                className="glass-card p-6 flex items-start gap-5"
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="text-center flex-shrink-0 min-w-[80px]">
                  <div className="text-2xl font-bold gradient-text">{feature.metric}</div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{feature.metricLabel}</div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-text-primary mb-1">{feature.title}</h4>
                  <p className="text-xs text-text-secondary leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}

            {/* Command Palette Preview */}
            <motion.div
              className="glass-card p-6 relative overflow-hidden"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] mb-4">
                <span className="text-text-muted">/</span>
                <span className="text-sm text-text-secondary">from:sarah has:attachment after:last week</span>
                <span
                  className="w-0.5 h-4 bg-accent-light ml-0.5"
                  style={{ animation: 'cursor-blink 1s infinite' }}
                />
              </div>
              <p className="text-xs text-text-muted">
                Gmail-style search operators work locally — <code className="text-accent-light/70">from:</code>,{' '}
                <code className="text-accent-light/70">to:</code>,{' '}
                <code className="text-accent-light/70">subject:</code>,{' '}
                <code className="text-accent-light/70">has:attachment</code>,{' '}
                <code className="text-accent-light/70">is:unread</code>,{' '}
                <code className="text-accent-light/70">before:</code>,{' '}
                <code className="text-accent-light/70">after:</code>,{' '}
                <code className="text-accent-light/70">label:</code>
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
