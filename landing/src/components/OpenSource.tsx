import { motion } from 'framer-motion'
import { Github, Code2, EyeOff, HardDrive, Lock } from 'lucide-react'

const TRUST_SIGNALS = [
  { icon: Code2, label: 'Open source' },
  { icon: EyeOff, label: 'No tracking' },
  { icon: HardDrive, label: 'Local database' },
  { icon: Lock, label: 'AES-256 encryption' },
]

export function OpenSource() {
  return (
    <section id="open-source" className="relative py-24 md:py-32 px-6 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-accent/[0.05] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto text-center">
        <motion.h2
          className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight mb-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <span className="gradient-text">Open source</span>
          <span className="text-text-primary"> and free forever</span>
        </motion.h2>

        <motion.p
          className="text-text-secondary text-lg max-w-xl mx-auto mb-12 leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          Every line of code is public. No telemetry, no data collection, no cloud dependency. Your email stays on your machine.
        </motion.p>

        <motion.div
          className="flex flex-wrap items-center justify-center gap-8 md:gap-12 mb-12"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {TRUST_SIGNALS.map((signal) => (
            <div key={signal.label} className="flex items-center gap-2.5 text-text-secondary">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                <signal.icon size={15} className="text-accent" strokeWidth={1.5} />
              </div>
              <span className="text-sm">{signal.label}</span>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <a
            href="https://github.com/avihaymenahem/velo"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <Github size={16} />
            Star on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  )
}
