import { motion } from 'framer-motion'
import { Sparkles, MessageSquare, PenTool, Search, Brain, Wand2 } from 'lucide-react'
import { SectionHeader } from './SectionHeader'

const AI_FEATURES = [
  {
    icon: MessageSquare,
    title: 'Thread Summaries',
    description: 'AI distills long conversations into key points, decisions, and action items. Cached locally to save API calls.',
    visual: (
      <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-accent-light" />
          <span className="text-xs font-medium text-accent-light">AI Summary</span>
        </div>
        <div className="space-y-2 text-xs text-text-secondary">
          <p>Sarah proposed moving the launch to March 15th. Alex agreed but requested more QA time.</p>
          <div className="flex items-center gap-1.5 text-accent-light/70">
            <span className="w-1 h-1 rounded-full bg-accent-light" />
            <span>Action: Schedule QA sprint by Feb 20</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Wand2,
    title: 'Smart Replies',
    description: 'AI suggests 2-3 context-aware quick replies. Click to insert and refine before sending.',
    visual: (
      <div className="mt-4 flex flex-wrap gap-2">
        {['Sounds great, let\'s proceed!', 'Can we discuss this tomorrow?', 'I\'ll review and get back to you'].map((reply) => (
          <div
            key={reply}
            className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent-light cursor-default hover:bg-accent/15 transition-colors"
          >
            {reply}
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: PenTool,
    title: 'AI Compose & Transform',
    description: 'Describe your email and AI drafts it. Select text to improve tone, shorten, formalize, fix grammar, translate, or simplify.',
    visual: (
      <div className="mt-4 space-y-2">
        {[
          { label: 'Improve tone', icon: '✨' },
          { label: 'Shorten text', icon: '📝' },
          { label: 'Formalize', icon: '👔' },
          { label: 'Fix grammar', icon: '📖' },
          { label: 'Translate', icon: '🌐' },
        ].map((transform) => (
          <div
            key={transform.label}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] text-xs text-text-secondary hover:bg-white/[0.05] transition-colors cursor-default"
          >
            <span>{transform.icon}</span>
            <span>{transform.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Search,
    title: 'Ask Inbox',
    description: 'Natural language queries across your entire inbox. "What did John say about Q3 budget?" — get AI-powered answers instantly.',
    visual: (
      <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <Brain size={14} className="text-accent-light" />
          <span className="text-xs text-text-muted">What did John say about the Q3 budget?</span>
        </div>
        <div className="text-xs text-text-secondary leading-relaxed">
          <span className="text-accent-light font-medium">Found in 3 threads: </span>
          John mentioned the Q3 budget is set at $240K, with $60K allocated to engineering and $45K to marketing...
        </div>
      </div>
    ),
  },
]

const AI_PROVIDERS = [
  { name: 'Claude', provider: 'Anthropic', color: 'from-orange-400 to-amber-500' },
  { name: 'GPT', provider: 'OpenAI', color: 'from-emerald-400 to-green-500' },
  { name: 'Gemini', provider: 'Google', color: 'from-blue-400 to-indigo-500' },
]

export function AiSection() {
  return (
    <section id="ai" className="py-24 md:py-32 px-6 relative z-10">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          badge="AI-Powered"
          title="Your inbox,"
          highlight="supercharged"
          description="Three AI providers, six superpowers. All results cached locally. Your API key, your data, your rules."
        />

        {/* AI Provider Badges */}
        <motion.div
          className="flex items-center justify-center gap-3 md:gap-4 mb-16 flex-wrap"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {AI_PROVIDERS.map((provider) => (
            <div
              key={provider.name}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06]"
            >
              <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${provider.color}`} />
              <span className="text-sm font-medium text-text-primary">{provider.name}</span>
              <span className="text-xs text-text-muted">{provider.provider}</span>
            </div>
          ))}
        </motion.div>

        {/* AI Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AI_FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="glass-card p-6 md:p-8 group relative overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <div className="feature-icon mb-4">
                  <feature.icon size={22} />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-text-primary">{feature.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
                {feature.visual}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Auto-categorization callout */}
        <motion.div
          className="mt-8 glass-card p-6 md:p-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <Brain size={20} className="text-accent-light" />
            <h3 className="text-lg font-semibold text-text-primary">Auto-Categorization</h3>
          </div>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            Rule-based pattern matching handles the obvious. AI refines the rest. Your inbox sorts itself into Primary, Updates, Promotions, Social, and Newsletters — automatically.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
