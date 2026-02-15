/** Full app layout mockup for the hero section — sidebar + email list + reading pane */
import {
  Inbox, Send, FileText, Trash2, Archive, Star, AlertTriangle,
  Keyboard, Brain, Sparkles, Paperclip, ChevronDown, Search,
  Settings, HelpCircle, PanelLeftClose, Plus,
} from 'lucide-react'

const SIDEBAR_ITEMS = [
  { icon: Inbox, label: 'Inbox', count: 12, active: true },
  { icon: Star, label: 'Starred', count: 3 },
  { icon: Send, label: 'Sent' },
  { icon: FileText, label: 'Drafts', count: 1 },
  { icon: Archive, label: 'Archive' },
  { icon: AlertTriangle, label: 'Spam' },
  { icon: Trash2, label: 'Trash' },
]

const LABELS = [
  { name: 'Work', color: '#6366F1' },
  { name: 'Personal', color: '#34D399' },
  { name: 'Finance', color: '#FBBF24' },
]

const THREADS = [
  { sender: 'Alex Chen', subject: 'Q1 product roadmap review', snippet: 'Hey team, here are the updated milestones for...', time: '10:32 AM', unread: true, avatar: 'A', starred: true },
  { sender: 'Sarah Kim', subject: 'Design system updates', snippet: 'The new component library is ready for review...', time: '9:15 AM', unread: true, avatar: 'S', category: 'Updates' },
  { sender: 'GitHub', subject: 'PR #142 merged successfully', snippet: 'Your pull request has been merged into main...', time: '8:45 AM', unread: false, avatar: 'G', category: 'Updates' },
  { sender: 'David Park', subject: 'Re: Weekend plans', snippet: 'Sounds great! Let me check my calendar and...', time: 'Yesterday', unread: false, avatar: 'D' },
  { sender: 'Stripe', subject: 'Your monthly invoice', snippet: 'Your invoice for January 2026 is ready...', time: 'Yesterday', unread: false, avatar: 'S', category: 'Promotions' },
  { sender: 'Maria Lopez', subject: 'Client presentation feedback', snippet: 'Great job on the deck! A few suggestions...', time: 'Yesterday', unread: false, avatar: 'M', attachment: true },
  { sender: 'Newsletter', subject: 'This Week in Tech', snippet: 'The biggest stories in technology this week...', time: 'Jan 28', unread: false, avatar: 'N', category: 'Newsletters' },
]

const MESSAGE_BODY = `Hi team,

I've put together the updated roadmap for Q1. Here are the key milestones:

1. Component library v2 — Feb 15
2. API redesign rollout — Mar 1
3. Mobile app beta — Mar 20

Let me know your thoughts on the timeline. I think we can hit all three if we prioritize the API work first.

Best,
Alex`

export function AppMockup() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#09090b] overflow-hidden shadow-2xl shadow-black/50">
      {/* Title bar */}
      <div className="flex items-center h-8 px-3 bg-[#0f0f12] border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[10px] text-zinc-500 mx-auto">Velo</span>
      </div>

      <div className="flex h-[420px] md:h-[480px]">
        {/* Sidebar */}
        <div className="hidden sm:flex w-48 flex-col border-r border-white/[0.06] bg-[#0c0c0f] py-2">
          {/* Account */}
          <div className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg hover:bg-white/[0.03]">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-[11px] text-indigo-400 font-medium">A</div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-zinc-300 font-medium truncate">Alex Chen</div>
              <div className="text-[9px] text-zinc-600 truncate">alex@company.com</div>
            </div>
            <ChevronDown size={10} className="text-zinc-600" />
          </div>

          {/* Compose */}
          <button className="mx-3 mt-2 mb-1 py-1.5 rounded-lg bg-indigo-500 text-white text-[11px] font-medium flex items-center justify-center gap-1.5">
            <Plus size={12} /> Compose
          </button>

          {/* Nav items */}
          <div className="mt-1 px-2 flex flex-col gap-0.5">
            {SIDEBAR_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] ${
                  item.active
                    ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                    : 'text-zinc-500 hover:bg-white/[0.03]'
                }`}
              >
                <item.icon size={13} />
                <span className="flex-1">{item.label}</span>
                {item.count && (
                  <span className={`text-[9px] px-1.5 rounded-full ${
                    item.active ? 'bg-indigo-500/15 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>{item.count}</span>
                )}
              </div>
            ))}
          </div>

          {/* Labels */}
          <div className="mt-3 px-4">
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium mb-1.5">Labels</div>
            {LABELS.map((label) => (
              <div key={label.name} className="flex items-center gap-2 py-1 text-[11px] text-zinc-500">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }} />
                {label.name}
              </div>
            ))}
          </div>

          {/* Bottom */}
          <div className="mt-auto px-2 flex items-center gap-1 border-t border-white/[0.04] pt-2">
            <button className="p-1.5 rounded-md text-zinc-600 hover:bg-white/[0.03]"><Settings size={12} /></button>
            <button className="p-1.5 rounded-md text-zinc-600 hover:bg-white/[0.03]"><HelpCircle size={12} /></button>
            <div className="flex-1" />
            <button className="p-1.5 rounded-md text-zinc-600 hover:bg-white/[0.03]"><PanelLeftClose size={12} /></button>
          </div>
        </div>

        {/* Email list */}
        <div className="w-full sm:w-64 md:w-72 flex-shrink-0 border-r border-white/[0.06] bg-[#0e0e11] flex flex-col">
          {/* Search */}
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <Search size={12} className="text-zinc-600" />
              <span className="text-[11px] text-zinc-600">Search emails...</span>
              <span className="ml-auto text-[9px] text-zinc-700 bg-zinc-800/50 rounded px-1 py-0.5">/</span>
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-hidden">
            {THREADS.map((thread, i) => (
              <div
                key={i}
                className={`px-3 py-2.5 border-b border-white/[0.04] cursor-pointer ${
                  i === 0 ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium flex-shrink-0 ${
                    thread.unread ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-500'
                  }`}>{thread.avatar}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] truncate ${thread.unread ? 'text-zinc-200 font-semibold' : 'text-zinc-500'}`}>{thread.sender}</span>
                      <span className="text-[9px] text-zinc-600 ml-2 flex-shrink-0">{thread.time}</span>
                    </div>
                    <div className={`text-[11px] truncate ${thread.unread ? 'text-zinc-300' : 'text-zinc-600'}`}>{thread.subject}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-zinc-700 truncate flex-1">{thread.snippet}</span>
                      {thread.starred && <Star size={9} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                      {thread.attachment && <Paperclip size={9} className="text-zinc-600 flex-shrink-0" />}
                      {thread.category && (
                        <span className={`text-[8px] px-1 rounded flex-shrink-0 ${
                          thread.category === 'Updates' ? 'bg-yellow-500/10 text-yellow-500' :
                          thread.category === 'Promotions' ? 'bg-emerald-500/10 text-emerald-500' :
                          'bg-orange-500/10 text-orange-500'
                        }`}>{thread.category}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reading pane */}
        <div className="hidden md:flex flex-1 flex-col bg-[#0b0b0e]">
          {/* Action bar */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.06]">
            {[Archive, Trash2, Star, Keyboard, Brain].map((Icon, i) => (
              <button key={i} className="p-1.5 rounded-md text-zinc-600 hover:bg-white/[0.04]">
                <Icon size={13} />
              </button>
            ))}
          </div>

          {/* Thread header */}
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-[13px] text-zinc-200 font-medium">Q1 product roadmap review</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[8px] text-indigo-400 font-medium">A</div>
              <span className="text-[11px] text-zinc-400">Alex Chen</span>
              <span className="text-[9px] text-zinc-600">to me</span>
              <span className="text-[9px] text-zinc-700 ml-auto">10:32 AM</span>
            </div>
          </div>

          {/* AI Summary */}
          <div className="mx-3 mt-2 p-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={11} className="text-indigo-400" />
              <span className="text-[10px] text-indigo-400 font-medium">AI Summary</span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Alex shares the Q1 roadmap with 3 milestones: component library v2 (Feb 15), API redesign (Mar 1), and mobile beta (Mar 20). Suggests prioritizing API work.
            </p>
          </div>

          {/* Message body */}
          <div className="flex-1 px-4 py-3 overflow-hidden">
            <pre className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap font-sans">{MESSAGE_BODY}</pre>
          </div>

          {/* Smart replies */}
          <div className="px-3 pb-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={10} className="text-indigo-400" />
              <span className="text-[9px] text-indigo-400 font-medium">Quick Replies</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Looks good, let\'s proceed!', 'Can we discuss the timeline?', 'I have a few concerns'].map((reply) => (
                <button key={reply} className="px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[9px] text-zinc-400 hover:border-indigo-500/30">
                  {reply}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
