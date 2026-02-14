import { motion } from 'framer-motion'
import { Download, Github } from 'lucide-react'
import { InboxMockup } from './InboxMockup'

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 px-6 overflow-hidden">
      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Badge */}
        <motion.div
          className="flex justify-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <a
            href="https://github.com/avihaymenahem/velo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-sm font-medium no-underline hover:bg-accent/15 transition-colors"
          >
            <Github size={14} />
            Open Source — Star us on GitHub
          </a>
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="text-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          Email at the
          <br />
          <span className="gradient-text-hero">speed of thought</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          className="text-center text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          The free, open-source desktop email client.
          <br className="hidden sm:block" />
          AI-powered. Keyboard-first. Privacy-focused. 130+ features.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 md:mb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <a href="https://github.com/avihaymenahem/velo/releases" target="_blank" rel="noopener noreferrer" className="glow-button text-base">
            <Download size={18} />
            Download for Free
          </a>
          <a href="https://github.com/avihaymenahem/velo" target="_blank" rel="noopener noreferrer" className="ghost-button text-base">
            <Github size={16} />
            View on GitHub
          </a>
        </motion.div>

        {/* Inbox Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <InboxMockup />
        </motion.div>
      </div>
    </section>
  )
}
