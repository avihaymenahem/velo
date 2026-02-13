import { motion } from 'framer-motion'
import { Download, Mail, Github, ArrowUp, Star } from 'lucide-react'

export function CtaFooter() {
  return (
    <section id="download" className="relative z-10">
      {/* CTA Section */}
      <div className="py-24 md:py-32 px-6">
        <div className="max-w-4xl mx-auto text-center relative">
          {/* Background glow */}
          <div className="absolute inset-0 -top-20 -bottom-20 bg-gradient-to-r from-accent/5 via-accent-violet/5 to-accent/5 rounded-3xl blur-3xl" />

          <div className="relative z-10">
            <motion.h2
              className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              Ready to reclaim
              <br />
              <span className="gradient-text">your inbox?</span>
            </motion.h2>

            <motion.p
              className="text-text-secondary text-lg max-w-xl mx-auto mb-10 leading-relaxed"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Free and open source, forever. Set up in 2 minutes with your Gmail account. No subscription. No tracking. Just fast email.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <a href="https://github.com/avihaymenahem/velo/releases" target="_blank" rel="noopener noreferrer" className="glow-button text-base">
                <Download size={18} />
                Download for Free
              </a>
              <a href="https://github.com/avihaymenahem/velo" target="_blank" rel="noopener noreferrer" className="ghost-button text-base">
                <Github size={18} />
                <Star size={15} />
                Star on GitHub
              </a>
            </motion.div>

            <motion.div
              className="mt-8 flex items-center justify-center gap-6 flex-wrap text-sm text-text-muted"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <span>Windows</span>
              <span className="w-1 h-1 rounded-full bg-text-muted" />
              <span>macOS</span>
              <span className="w-1 h-1 rounded-full bg-text-muted" />
              <span>Linux</span>
              <span className="w-1 h-1 rounded-full bg-text-muted" />
              <span>Free & Open Source</span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-dark to-accent-violet flex items-center justify-center">
              <Mail size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-text-primary tracking-tight">Velo</span>
            <span className="text-xs text-text-muted">by velomail.app</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-text-muted">
            <a href="#features" className="hover:text-text-secondary transition-colors no-underline">Features</a>
            <a href="#security" className="hover:text-text-secondary transition-colors no-underline">Security</a>
            <a href="https://github.com/avihaymenahem/velo" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors no-underline">GitHub</a>
            <a href="mailto:info@velomail.app" className="hover:text-text-secondary transition-colors no-underline">Contact</a>
          </div>

          {/* Back to top */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <ArrowUp size={14} />
            Back to top
          </button>
        </div>

        <div className="max-w-6xl mx-auto mt-6 pt-4 border-t border-white/[0.04] text-center">
          <p className="text-xs text-text-muted">
            Free & open source. Built with Tauri, React, and obsessive attention to detail.
            <a href="https://github.com/avihaymenahem/velo" target="_blank" rel="noopener noreferrer" className="text-accent-light/60 hover:text-accent-light transition-colors ml-1 no-underline">github.com/avihaymenahem/velo</a>
          </p>
        </div>
      </footer>
    </section>
  )
}
