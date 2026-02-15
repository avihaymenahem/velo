import { motion } from 'framer-motion'
import { Download, Github } from 'lucide-react'
import { AppMockup } from './mockups/AppMockup'

export function Hero() {
  return (
    <section className="relative pt-32 pb-16 md:pt-44 md:pb-24 px-6 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-accent/[0.07] rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        {/* Label */}
        <motion.div
          className="flex justify-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.06] bg-white/[0.03]">
            <img src="/logo-white.svg" alt="Velo" className="h-4 w-auto" />
            <span className="text-sm text-text-secondary">Open source desktop email client</span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="text-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light leading-[1.1] tracking-tight mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
        >
          <span className="text-text-primary">The email client </span>
          <br />
          <span className="gradient-text">you'd build for yourself</span>
        </motion.h1>

        {/* Subline */}
        <motion.p
          className="text-center text-lg md:text-xl text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Keyboard-first, AI-powered, and completely private.
          <br className="hidden sm:block" />
          Free forever because it's open source.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 md:mb-28"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <a href="https://github.com/avihaymenahem/velo/releases" target="_blank" rel="noopener noreferrer" className="btn-primary">
            <Download size={17} />
            Download for Free
          </a>
          <a href="https://github.com/avihaymenahem/velo" target="_blank" rel="noopener noreferrer" className="btn-secondary">
            <Github size={16} />
            View on GitHub
          </a>
        </motion.div>

        {/* App mockup with glow behind */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Glow behind mockup */}
          <div className="absolute -inset-4 bg-accent/[0.06] rounded-2xl blur-[60px] pointer-events-none" />
          <div className="relative mockup-hover">
            <AppMockup />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
