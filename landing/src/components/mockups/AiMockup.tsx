/** AI assistant mockup showing thread summary, smart replies, and inline reply with AI assist */
import { Sparkles, RefreshCw, Wand2, Send } from 'lucide-react'

export function AiMockup() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e0e11] overflow-hidden shadow-2xl shadow-black/50">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="text-[13px] text-zinc-200 font-medium">Re: Partnership proposal — Acme Corp</div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[8px] text-emerald-400 font-medium">J</div>
          <span className="text-[11px] text-zinc-400">Julia Martinez</span>
          <span className="text-[10px] text-zinc-700">· 3 messages</span>
        </div>
      </div>

      {/* AI Summary */}
      <div className="mx-3 mt-3 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles size={12} className="text-indigo-400" />
          <span className="text-[11px] text-indigo-400 font-medium">AI Summary</span>
          <button className="ml-auto p-0.5 rounded text-zinc-600 hover:text-zinc-400">
            <RefreshCw size={10} />
          </button>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Julia proposes a partnership with Acme Corp for Q2. Key terms: 15% revenue share, 12-month commitment, joint marketing campaign. She's requesting a meeting next week to discuss details.
        </p>
      </div>

      {/* Message preview */}
      <div className="px-4 py-3">
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Hi Alex,<br /><br />
          Following up on our conversation at the conference. I'd love to schedule a call to discuss the partnership terms in detail. Would Thursday or Friday work for you?<br /><br />
          I've attached the proposed agreement for your review.<br /><br />
          Best,<br />Julia
        </p>
      </div>

      {/* Smart replies */}
      <div className="px-3 pb-3 border-t border-white/[0.06] pt-2.5">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles size={10} className="text-indigo-400" />
          <span className="text-[10px] text-indigo-400 font-medium">Quick Replies</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            'Thursday works! Let\'s meet at 2pm.',
            'I\'ll review the agreement and get back to you.',
            'Can we also invite the legal team?',
          ].map((reply) => (
            <button key={reply} className="px-2.5 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-[10px] text-zinc-400 hover:border-indigo-500/30 transition-colors">
              {reply}
            </button>
          ))}
        </div>
      </div>

      {/* Inline reply composer with AI assist */}
      <div className="mx-3 mb-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
        <div className="px-3 py-2.5">
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            Hi Julia,<br /><br />
            Thursday at 2pm works perfectly. I'll review the proposed agreement before our call so we can dive right into the details.<br /><br />
            Would it be alright if I include our legal counsel? It would help streamline the process.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.04]">
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 font-medium">
            <Wand2 size={10} />
            AI Assist
          </button>
          <div className="flex-1" />
          <button className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-500 text-white text-[10px] font-medium">
            <Send size={9} />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
