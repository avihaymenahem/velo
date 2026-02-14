import { motion } from 'framer-motion'
import { Shield, ShieldCheck, ShieldAlert, Eye, EyeOff, Database, Lock, AlertTriangle, Link2, Globe, Github, Code } from 'lucide-react'
import { SectionHeader } from './SectionHeader'

const PHISHING_RULES = [
  'IP-based URLs',
  'Homograph attacks',
  'Suspicious TLDs',
  'URL shorteners',
  'Display/href mismatch',
  'Suspicious paths',
  'Brand impersonation',
  'Dangerous protocols',
  'Free email impostor',
  'Subdomain spoofing',
]

const SECURITY_FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Authentication Badges',
    description: 'SPF, DKIM, and DMARC verification displayed as green/orange/red badges on every email. Know instantly if a sender is legitimate.',
    visual: (
      <div className="mt-4 flex items-center gap-3">
        {[
          { label: 'SPF', status: 'pass', color: 'bg-success' },
          { label: 'DKIM', status: 'pass', color: 'bg-success' },
          { label: 'DMARC', status: 'pass', color: 'bg-success' },
        ].map((badge) => (
          <div key={badge.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06]">
            <div className={`w-2 h-2 rounded-full ${badge.color}`} />
            <span className="text-xs font-medium text-text-primary">{badge.label}</span>
            <span className="text-[10px] text-success">{badge.status}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: EyeOff,
    title: 'Remote Image Blocking',
    description: 'Tracking pixels and external images blocked by default. Allow-list trusted senders individually. Your reading habits stay private.',
  },
  {
    icon: Link2,
    title: 'Link Confirmation',
    description: 'Preview the actual URL before clicking any link. Prevents disguised malicious links from catching you off guard.',
  },
  {
    icon: Database,
    title: 'Local-First Architecture',
    description: 'All data stored in SQLite on your machine. 31 tables, zero cloud dependency. Your email never touches our servers.',
  },
  {
    icon: Lock,
    title: 'Secure Authentication',
    description: 'Gmail uses OAuth PKCE — no stored passwords. IMAP passwords encrypted with AES-256-GCM. Your credentials never leave your machine.',
  },
  {
    icon: Globe,
    title: 'Unsubscribe Protection',
    description: 'One-click unsubscribe via RFC 8058. Track unsubscribe history. Take back control of your inbox.',
  },
]

export function Security() {
  return (
    <section id="security" className="py-24 md:py-32 px-6 relative z-10">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          badge="Security"
          title="Your data stays"
          highlight="on your machine"
          description="Local-first by design. No cloud storage. No tracking. Phishing detection, sender verification, and link protection built in."
        />

        {/* Phishing Detection Showcase */}
        <motion.div
          className="glass-card p-6 md:p-8 mb-8 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-orange-500/5 opacity-50" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="feature-icon !bg-danger/10 !border-danger/20 !text-danger">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Phishing Detection</h3>
                <p className="text-sm text-text-secondary">10 heuristic rules scan every link in every email</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {PHISHING_RULES.map((rule, i) => (
                <motion.div
                  key={rule}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                >
                  <AlertTriangle size={12} className="text-warning flex-shrink-0" />
                  <span className="text-xs text-text-secondary">{rule}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs text-text-muted">
              <span>Sensitivity levels: </span>
              {['Low', 'Default', 'High'].map((level) => (
                <span
                  key={level}
                  className={`px-2 py-0.5 rounded ${level === 'Default' ? 'bg-accent/10 text-accent-light' : 'bg-white/[0.03]'}`}
                >
                  {level}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Security Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECURITY_FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="glass-card p-6 group"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <div className="feature-icon mb-4 !bg-emerald-500/10 !border-emerald-500/20 !text-success">
                <feature.icon size={20} />
              </div>
              <h3 className="text-sm font-semibold mb-2 text-text-primary">{feature.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{feature.description}</p>
              {feature.visual}
            </motion.div>
          ))}
        </div>

        {/* Open Source Callout */}
        <motion.a
          href="https://github.com/avihaymenahem/velo"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 glass-card p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 group no-underline cursor-pointer"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="feature-icon !w-14 !h-14 !bg-white/[0.06] !border-white/[0.1] !text-text-primary group-hover:!border-accent/30 transition-colors">
            <Github size={28} />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-lg font-semibold text-text-primary mb-1">Completely Open Source</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Every line of code is public on GitHub. Inspect it, audit it, contribute to it, or fork it. No hidden telemetry, no secret endpoints, no trust required — verify everything yourself.
            </p>
          </div>
          <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-text-secondary group-hover:text-text-primary group-hover:border-accent/20 transition-colors flex-shrink-0">
            <Github size={16} />
            <span className="text-sm font-medium">Star on GitHub</span>
          </div>
        </motion.a>

        {/* Privacy Badge */}
        <motion.div
          className="mt-8 flex items-center justify-center gap-6 flex-wrap"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {[
            { icon: Code, text: '100% Open Source' },
            { icon: Eye, text: 'No Analytics' },
            { icon: Shield, text: 'No Tracking' },
            { icon: Database, text: 'No Cloud Storage' },
            { icon: Lock, text: 'Your API Keys' },
          ].map((badge) => (
            <div key={badge.text} className="flex items-center gap-2 text-sm text-text-muted">
              <badge.icon size={16} className="text-success" />
              <span>{badge.text}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
