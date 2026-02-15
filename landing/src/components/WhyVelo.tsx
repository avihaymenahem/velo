import { motion } from 'framer-motion'
import { Keyboard, Brain, ShieldCheck } from 'lucide-react'

const DIFFERENTIATORS = [
  {
    icon: Keyboard,
    title: 'Keyboard-first',
    description:
      '30+ shortcuts, two-key sequences, and a command palette. Navigate your entire inbox without touching the mouse. Fully customizable.',
  },
  {
    icon: Brain,
    title: 'AI on your terms',
    description:
      'Claude, GPT, or Gemini — pick your provider, use your own API key. Summaries, smart replies, and auto-categorization. Your data never leaves your machine.',
  },
  {
    icon: ShieldCheck,
    title: 'Local-first privacy',
    description:
      'Everything stored in a local SQLite database. No cloud, no tracking, no analytics. Built-in phishing detection and AES-256 encryption.',
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

export function WhyVelo() {
  return (
    <section id="features" className="relative py-24 md:py-32 px-6 dot-grid">
      {/* Subtle top/bottom fade to blend the dot grid */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-bg-primary to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-bg-primary to-transparent pointer-events-none" />

      <div className="relative max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        {DIFFERENTIATORS.map((item, i) => (
          <motion.div
            key={item.title}
            className="group rounded-xl border border-transparent p-6 transition-colors duration-300 hover:border-white/[0.06] hover:bg-white/[0.02]"
            custom={i}
            variants={cardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 transition-colors duration-300 group-hover:bg-accent/15 group-hover:border-accent/30">
              <item.icon size={20} className="text-accent" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-2">{item.title}</h3>
            <p className="text-text-secondary leading-relaxed text-[15px]">{item.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
