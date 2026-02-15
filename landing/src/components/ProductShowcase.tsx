import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { SplitInboxMockup } from './mockups/SplitInboxMockup'
import { AiMockup } from './mockups/AiMockup'
import { MultiProviderMockup } from './mockups/MultiProviderMockup'

const FEATURES: { title: string; description: string; mockup: ReactNode }[] = [
  {
    title: 'Split inbox',
    description:
      'Emails are auto-sorted into Primary, Updates, Promotions, Social, and Newsletters. Rule-based categorization with AI fallback keeps your inbox organized without manual effort.',
    mockup: <SplitInboxMockup />,
  },
  {
    title: 'AI assistant',
    description:
      'Choose from Claude, GPT, or Gemini. Get thread summaries, smart reply suggestions, AI-composed drafts, and natural-language inbox search — all running through your own API key.',
    mockup: <AiMockup />,
  },
  {
    title: 'Multi-provider',
    description:
      'Connect Gmail, Outlook, Yahoo, iCloud, Fastmail, or any IMAP server. Auto-discovery for major providers. Manage all your accounts from a single unified inbox.',
    mockup: <MultiProviderMockup />,
  },
]

export function ProductShowcase() {
  return (
    <section className="py-24 md:py-32 px-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-32 md:gap-40">
        {FEATURES.map((feature, i) => {
          const reversed = i % 2 !== 0

          return (
            <motion.div
              key={feature.title}
              className={`flex flex-col gap-10 md:gap-16 items-center ${
                reversed ? 'md:flex-row-reverse' : 'md:flex-row'
              }`}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Text */}
              <div className="md:w-5/12 flex-shrink-0">
                <h3 className="text-2xl md:text-3xl font-light tracking-tight mb-4">
                  <span className="gradient-text">{feature.title}</span>
                </h3>
                <p className="text-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </div>

              {/* Mockup */}
              <div className="md:w-7/12 w-full mockup-hover">
                {feature.mockup}
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
