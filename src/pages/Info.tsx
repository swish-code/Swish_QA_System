import React, { useState, useMemo } from 'react';
import {
  BookOpen, AlertTriangle, ListChecks, ClipboardList, Workflow, Calculator,
  Search, ShieldAlert
} from 'lucide-react';

/**
 * Source of truth for the in-app QA Manual page.
 * All data is embedded as JS objects so the page works offline / on Railway
 * without a backend fetch. If the underlying manual ever moves to a CMS,
 * swap this for a /api/info fetch — the rendering layer doesn't care.
 */

type CategoryCode = 'CTC' | 'CTB' | 'CTS' | 'NON';

const CATEGORIES: { code: CategoryCode; name: string; meaning: string; tone: string }[] = [
  { code: 'CTC', name: 'Critical To Customer', meaning: 'Direct impact on customer experience and satisfaction', tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' },
  { code: 'CTB', name: 'Critical To Business', meaning: 'Direct impact on compliance, documentation, policies, business requirements', tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  { code: 'CTS', name: 'Critical To Service', meaning: 'Direct impact on service delivery, order handling, accuracy, execution', tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30' },
  { code: 'NON', name: 'Non-Critical', meaning: 'Supporting operational attributes', tone: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30' },
];

const LEADS_TO_ZERO = [
  'Unprofessional Behavior / Poor Attitude',
  'Providing Incorrect Information',
  'Failure to Escalate Critical Complaints or Document Complaints',
  'Improper Call Handling',
  'Privacy & Security Violations',
];

type Row = { attr: string; weight: number; category: CategoryCode; level: string };

const SCORECARDS: { key: string; title: string; rows: Row[] }[] = [
  { key: 'new_order', title: 'New Order', rows: [
    { attr: 'Opening', weight: 4, category: 'NON', level: 'Soft skill' },
    { attr: 'Active Listening', weight: 7, category: 'CTC', level: 'Soft skill' },
    { attr: 'Professional Tone', weight: 8, category: 'CTC', level: 'Soft skill' },
    { attr: 'Menu Knowledge', weight: 7, category: 'CTS', level: 'Operational error' },
    { attr: 'System Navigation', weight: 5, category: 'CTS', level: 'Operational error' },
    { attr: 'Upselling', weight: 5, category: 'CTB', level: 'Operational error' },
    { attr: 'Customer Verification', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Order Confirmation', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Empathy', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Skill of Language', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'SOP Compliance', weight: 7, category: 'CTB', level: 'Operational error' },
    { attr: 'Policy Compliance', weight: 7, category: 'CTS', level: 'Operational error' },
    { attr: 'Hold Management', weight: 4, category: 'CTC', level: 'Soft skill' },
    { attr: 'Time Management', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Closing', weight: 6, category: 'CTC', level: 'Soft skill' },
    { attr: 'Handling Special Requests', weight: 5, category: 'CTS', level: 'Operational error' },
  ]},
  { key: 'inquiry', title: 'Inquiry', rows: [
    { attr: 'Opening', weight: 4, category: 'NON', level: 'Soft skill' },
    { attr: 'Active Listening', weight: 7, category: 'CTC', level: 'Soft skill' },
    { attr: 'Professional Tone', weight: 8, category: 'CTC', level: 'Soft skill' },
    { attr: 'Understanding Customer Need', weight: 8, category: 'CTS', level: 'Operational error' },
    { attr: 'Information Accuracy', weight: 8, category: 'CTS', level: 'Operational error' },
    { attr: 'Documentation', weight: 4, category: 'CTB', level: 'Operational error' },
    { attr: 'Menu Knowledge', weight: 8, category: 'CTS', level: 'Operational error' },
    { attr: 'System Navigation', weight: 8, category: 'CTS', level: 'Operational error' },
    { attr: 'Policy Compliance', weight: 8, category: 'CTS', level: 'Soft skill' },
    { attr: 'Skill of Language', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Explanation Clarity', weight: 8, category: 'CTC', level: 'Operational error' },
    { attr: 'Empathy', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Handling Skills', weight: 4, category: 'CTC', level: 'Soft skill' },
    { attr: 'Hold Management', weight: 4, category: 'CTC', level: 'Soft skill' },
    { attr: 'Time Management', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Closing', weight: 6, category: 'CTC', level: 'Soft skill' },
  ]},
  { key: 'follow_up', title: 'Follow Up', rows: [
    { attr: 'Opening', weight: 4, category: 'NON', level: 'Soft skill' },
    { attr: 'Active Listening', weight: 7, category: 'CTC', level: 'Soft skill' },
    { attr: 'Professional Tone', weight: 8, category: 'CTC', level: 'Soft skill' },
    { attr: 'Customer Verification', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Order Lookup Accuracy', weight: 8, category: 'CTS', level: 'Operational error' },
    { attr: 'Information Accuracy', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Status Of Order', weight: 5, category: 'CTC', level: 'Operational error' },
    { attr: 'Ownership', weight: 8, category: 'CTS', level: 'Soft skill' },
    { attr: 'Empathy', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Handling Skills', weight: 4, category: 'CTC', level: 'Soft skill' },
    { attr: 'Next Step Clarity', weight: 3, category: 'CTC', level: 'Operational error' },
    { attr: 'Explanation Clarity', weight: 8, category: 'CTC', level: 'Operational error' },
    { attr: 'Time Management', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Hold Management', weight: 4, category: 'CTC', level: 'Soft skill' },
    { attr: 'Closing', weight: 6, category: 'CTC', level: 'Soft skill' },
    { attr: 'Skill of Language', weight: 5, category: 'CTC', level: 'Soft skill' },
  ]},
  { key: 'complaints', title: 'Complaints', rows: [
    { attr: 'Opening', weight: 4, category: 'NON', level: 'Soft skill' },
    { attr: 'Active Listening', weight: 7, category: 'CTC', level: 'Soft skill' },
    { attr: 'Empathy', weight: 6, category: 'CTC', level: 'Soft skill' },
    { attr: 'Skill of Language', weight: 6, category: 'CTC', level: 'Soft skill' },
    { attr: 'Handling Skills', weight: 6, category: 'CTC', level: 'Soft skill' },
    { attr: 'Explanation Clarity', weight: 8, category: 'CTC', level: 'Operational error' },
    { attr: 'SOP Compliance', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Complaint Documentation', weight: 7, category: 'CTB', level: 'Operational error' },
    { attr: 'FCR & Escalation', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Next Step Clarity', weight: 8, category: 'CTC', level: 'Operational error' },
    { attr: 'Ownership', weight: 8, category: 'CTS', level: 'Soft skill' },
    { attr: 'Professional Tone', weight: 8, category: 'CTC', level: 'Soft skill' },
    { attr: 'Calm Under Pressure', weight: 6, category: 'CTC', level: 'Soft skill' },
    { attr: 'Closing', weight: 6, category: 'CTC', level: 'Soft skill' },
  ]},
  { key: 'outbound', title: 'Outbound', rows: [
    { attr: 'Opening & Introduction', weight: 5, category: 'NON', level: 'Soft skill' },
    { attr: 'Purpose of Call', weight: 10, category: 'CTS', level: 'Soft skill' },
    { attr: 'Active Listening', weight: 7, category: 'CTC', level: 'Soft skill' },
    { attr: 'Customer Verification', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Information Accuracy', weight: 10, category: 'CTS', level: 'Operational error' },
    { attr: 'Customer Needs Assessment', weight: 8, category: 'CTS', level: 'Soft skill' },
    { attr: 'Objection Handling', weight: 8, category: 'CTC', level: 'Soft skill' },
    { attr: 'Policy Compliance', weight: 8, category: 'CTB', level: 'Operational error' },
    { attr: 'Next Step Clarity', weight: 5, category: 'CTC', level: 'Operational error' },
    { attr: 'Professional Tone', weight: 8, category: 'CTC', level: 'Soft skill' },
    { attr: 'Time Management', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Hold Management', weight: 5, category: 'CTC', level: 'Soft skill' },
    { attr: 'Closing', weight: 6, category: 'CTC', level: 'Soft skill' },
    { attr: 'Empathy', weight: 5, category: 'CTC', level: 'Soft skill' },
  ]},
];

type AttrDef = {
  attr: string;
  category: CategoryCode;
  applies: string;
  ltz: boolean;
  definition: string;
  pass: string;
  fail: string;
  notes: string;
};

const ATTRIBUTE_DICT: AttrDef[] = [
  { attr: 'Opening', category: 'NON', applies: 'All', ltz: false, definition: 'Professional greeting and self-introduction', pass: 'Greeting + self-introduction completed', fail: 'Missing greeting or self-introduction', notes: 'Inbound brand; optional wrong brand = fail' },
  { attr: 'Active Listening', category: 'CTC', applies: 'All', ltz: false, definition: 'Let customer explain without unnecessary interruption', pass: 'Customer allowed to explain; relevant questions asked', fail: 'Repeated interruption or assumptions', notes: 'Clarification questions acceptable' },
  { attr: 'Professional Tone', category: 'CTC', applies: 'All', ltz: true, definition: 'Clear, respectful, professional tone', pass: 'Appropriate tone, pace, volume', fail: 'Shouting, unclear speech, very fast/slow pace', notes: 'Behavior' },
  { attr: 'Skill of Language', category: 'CTC', applies: 'New Order, Inquiry, Complaints, Follow-up', ltz: false, definition: 'Clear professional language suited to customer', pass: 'Clear, customer-friendly wording', fail: 'Confusing/inappropriate/unprofessional wording', notes: 'Match language to customer understanding' },
  { attr: 'Menu Knowledge', category: 'CTS', applies: 'New Order, Inquiry', ltz: true, definition: 'Accurate menu items & promotions knowledge', pass: 'Provides correct menu info', fail: 'Provides missed menu info', notes: 'Wrong confirmed info → zero' },
  { attr: 'System Navigation', category: 'CTS', applies: 'New Order, Inquiry', ltz: false, definition: 'Use systems efficiently & correctly', pass: 'Retrieves/processes info correctly', fail: 'Excessive delays or incorrect usage', notes: 'Verified system issues may be excluded' },
  { attr: 'Upselling', category: 'CTB', applies: 'New Order', ltz: false, definition: 'Offer relevant additional items', pass: 'Relevant upsell offered', fail: 'No upsell on applicable orders', notes: 'New Order calls only' },
  { attr: 'Customer Verification', category: 'CTS', applies: 'New Order, Follow Up, Outbound', ltz: true, definition: 'Verify required customer & order details', pass: 'Required verification completed', fail: 'Missing required verification', notes: 'Zero when privacy shared by another person' },
  { attr: 'Order Confirmation', category: 'CTS', applies: 'New Order', ltz: false, definition: 'Confirm complete order details', pass: 'Items, qty, notes, amount confirmed', fail: 'Missing key confirmation details', notes: 'Total amount must be confirmed' },
  { attr: 'Information Accuracy', category: 'CTS', applies: 'Inquiry, Outbound, Follow-up', ltz: true, definition: 'Complete & accurate information', pass: 'Information verified & accurate', fail: 'Incomplete or missing information', notes: 'Wrong confirmed info → zero' },
  { attr: 'SOP Compliance', category: 'CTB', applies: 'New Order, Complaint', ltz: false, definition: 'Follow approved procedures/workflows', pass: 'Required SOP followed', fail: 'Mandatory SOP steps missed', notes: 'One mistake = one deduction' },
  { attr: 'Policy Compliance', category: 'CTB', applies: 'New Order, Inquiry, Outbound', ltz: true, definition: 'Follow company policies', pass: 'Policy applied correctly', fail: 'Policy violation / unauthorized exception', notes: 'Severe violations → zero' },
  { attr: 'Hold Management', category: 'CTC', applies: 'New Order, Inquiry, Outbound, Follow-up', ltz: false, definition: 'Manage hold procedures correctly', pass: 'Permission taken & returned ≤60s', fail: 'No permission or exceeded 60s', notes: 'Return & update customer if more time needed' },
  { attr: 'Time Management', category: 'CTC', applies: 'New Order, Inquiry, Outbound, Follow-up', ltz: false, definition: 'Manage call time efficiently', pass: 'No unnecessary delays/dead air', fail: 'Dead air >10s or delays', notes: 'System outages may be excluded' },
  { attr: 'Handling Special Requests', category: 'CTS', applies: 'New Order', ltz: false, definition: 'Manage special order requests', pass: 'Request recorded & communicated', fail: 'Request ignored or recorded wrong', notes: 'Order-related requests' },
  { attr: 'Empathy', category: 'CTC', applies: 'All', ltz: false, definition: 'Understanding, ownership, reassurance', pass: 'Concern acknowledged + reassurance', fail: 'No empathy or generic apology only', notes: '"Sorry" alone is not empathy' },
  { attr: 'Documentation', category: 'CTB', applies: 'Inquiry', ltz: false, definition: 'Document required interactions', pass: 'Required documentation completed', fail: 'Required documentation missing', notes: 'Presence of documentation evaluated' },
  { attr: 'Explanation Clarity', category: 'CTC', applies: 'Inquiry, Complaint, Follow-up', ltz: false, definition: 'Explain information clearly', pass: 'Customer understands explanation', fail: 'Confusing or incomplete explanation', notes: 'Accuracy alone not enough' },
  { attr: 'Handling Skills', category: 'CTS', applies: 'Inquiry, Complaint, Follow-up', ltz: false, definition: 'Manage & guide interaction', pass: 'Interaction controlled professionally', fail: 'Poor control / missed critical info', notes: 'Focus on managing the interaction' },
  { attr: 'Order Lookup Accuracy', category: 'CTS', applies: 'Follow Up', ltz: false, definition: 'Review correct order info', pass: 'Correct order reviewed', fail: 'Wrong order or missed details', notes: 'Mainly follow-up cases' },
  { attr: 'Status Of Order', category: 'CTC', applies: 'Follow Up', ltz: false, definition: 'Explain current order status clearly', pass: 'Clear, accurate status update', fail: 'Vague or misleading update', notes: 'Accuracy & clarity required' },
  { attr: 'Ownership', category: 'CTS', applies: 'Follow Up, Complaint', ltz: false, definition: 'Take responsibility, ensure action', pass: 'Case followed or escalated appropriately', fail: 'Case ignored without valid reason', notes: 'Ownership ≠ solving personally' },
  { attr: 'Next Step Clarity', category: 'CTC', applies: 'Follow Up, Complaint, Outbound', ltz: false, definition: 'Explain what happens next', pass: 'Clear next steps & expectations', fail: 'No/unclear next steps', notes: 'Timelines should be realistic' },
  { attr: 'Complaint Documentation', category: 'CTB', applies: 'Complaint', ltz: true, definition: 'Document complaints when required', pass: 'Complaint documented', fail: 'Complaint not documented', notes: 'No doc = Zero; wrong classification = Attribute Fail' },
  { attr: 'FCR & Escalation', category: 'CTS', applies: 'Complaint', ltz: true, definition: 'Correct resolution or escalation', pass: 'Correct action taken', fail: 'Incorrect resolution/escalation', notes: 'Resolution ≠ always compensation' },
  { attr: 'Calm Under Pressure', category: 'CTC', applies: 'Complaint', ltz: false, definition: 'Stay professional in difficult situations', pass: 'Calm & composed behavior', fail: 'Argumentative/emotional reactions', notes: 'Customer behavior doesn\'t justify misconduct' },
  { attr: 'Customer Needs Assessment', category: 'CTS', applies: 'Outbound', ltz: false, definition: 'Understand needs before recommending', pass: 'Needs explored via relevant questions', fail: 'Assumptions / irrelevant recommendations', notes: 'Important in outbound & sales' },
  { attr: 'Objection Handling', category: 'CTC', applies: 'Outbound', ltz: false, definition: 'Address objections effectively', pass: 'Objection acknowledged & handled', fail: 'Ignoring or arguing', notes: 'Focus on understanding & responding' },
  { attr: 'Purpose of Call', category: 'CTS', applies: 'Outbound', ltz: false, definition: 'Explain reason for outbound contact', pass: 'Purpose clearly stated', fail: 'Purpose unclear/missing', notes: 'Outbound calls only' },
  { attr: 'Closing', category: 'CTC', applies: 'All', ltz: false, definition: 'Professionally end the interaction', pass: 'Checks if further help needed before closing', fail: 'Abrupt ending or no final check', notes: 'Minimum: ask if customer needs anything else' },
];

const SOP_FLOWS: { call_type: string; flow: string }[] = [
  { call_type: 'New Order', flow: 'Opening → Delivery/Pickup → Serviceability Verification → Order Taking → Relevant Upselling → Order Confirmation → Customer Details → Closing' },
  { call_type: 'Inquiry', flow: 'Opening → Identify Inquiry → Verify Information → Provide Information → Additional Assistance → Closing' },
  { call_type: 'Follow-Up', flow: 'Verify Customer → Check System → Contact Branch → Status Update → Late Order Handling → Closing' },
  { call_type: 'Complaint', flow: 'Listen → Empathy → Verify → Identify Complaint Type → Resolution → Escalation → Documentation → Closure' },
  { call_type: 'Outbound', flow: 'Greeting → Self Introduction → Brand Name → Purpose of Call → Verification → Information Delivery → Next Steps → Closing' },
];

const SCORING_RULES = [
  'Each call is evaluated only against the scorecard for its call type.',
  'Each attribute is scored Pass (full weight) or Fail (0 for that attribute).',
  'Final score = Σ(weights of passed attributes) / Σ(all weights for that scorecard) × 100.',
  'If any attribute with Leads To Zero = Yes fails under its stated condition (or any "Leads To Zero Policy" violation occurs), the entire call score = 0, regardless of other attributes.',
  'The Category (CTC/CTB/CTS/NON) and Level (Soft skill / Operational error) are reporting/analytics dimensions and do not change the weight math.',
];

const SECTIONS = [
  { id: 'categories', label: 'Categories', icon: BookOpen },
  { id: 'leads-to-zero', label: 'Leads to Zero', icon: AlertTriangle },
  { id: 'scorecards', label: 'Scorecards', icon: ListChecks },
  { id: 'attributes', label: 'Attribute Dictionary', icon: ClipboardList },
  { id: 'sop', label: 'SOP Flows', icon: Workflow },
  { id: 'rules', label: 'Scoring Rules', icon: Calculator },
] as const;

function catChip(code: CategoryCode) {
  const c = CATEGORIES.find(c => c.code === code);
  return c?.tone || 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30';
}

export default function Info() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string>('categories');

  // Filter the master attribute dictionary by the search term.
  const filteredAttrs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ATTRIBUTE_DICT;
    return ATTRIBUTE_DICT.filter(a =>
      a.attr.toLowerCase().includes(q) ||
      a.applies.toLowerCase().includes(q) ||
      a.definition.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    );
  }, [search]);

  const jump = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-500/20">
        <BookOpen className="absolute top-3 right-3 text-white/20" size={120} />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30">
            <BookOpen size={28} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter italic uppercase">QA & Customer Service Manual</h1>
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-widest opacity-90 mt-1">v1.0 — Categories, scorecards, attributes, and the scoring rules</p>
          </div>
        </div>
      </div>

      {/* Nav strip */}
      <div className="sticky top-16 sm:top-20 z-30 -mx-4 sm:mx-0 sm:rounded-2xl bg-white/95 dark:bg-zinc-950/95 backdrop-blur border border-zinc-200 dark:border-zinc-800 p-2 shadow-sm overflow-x-auto">
        <div className="flex gap-1 min-w-fit">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => jump(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
              >
                <Icon size={12} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Categories */}
      <Section id="categories" title="1. QA Categories" subtitle="The four dimensions every attribute is tagged under">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CATEGORIES.map(c => (
            <div key={c.code} className={`p-4 rounded-2xl border ${c.tone}`}>
              <p className="text-2xl font-black tracking-tighter">{c.code}</p>
              <p className="text-xs font-black uppercase tracking-widest mt-1">{c.name}</p>
              <p className="text-[11px] mt-2 opacity-80 leading-relaxed">{c.meaning}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 2. Leads to Zero */}
      <Section id="leads-to-zero" title="2. Leads To Zero Policy" subtitle="Any of these failures automatically scores the entire call = 0">
        <div className="bg-rose-500/5 border border-rose-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="text-rose-500" size={18} />
            <p className="text-[11px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Automatic zero triggers</p>
          </div>
          <ul className="space-y-2">
            {LEADS_TO_ZERO.map((line, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 3. Scorecards */}
      <Section id="scorecards" title="3. Scorecards" subtitle="Weighted attribute list per call type. Pass = full weight, Fail = 0 weight.">
        <div className="space-y-5">
          {SCORECARDS.map(sc => {
            const total = sc.rows.reduce((s, r) => s + r.weight, 0);
            return (
              <div key={sc.key} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-tighter">{sc.title}</h3>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <span>{sc.rows.length} attributes</span>
                    <span>·</span>
                    <span>Total weight <b className="text-zinc-900 dark:text-white">{total}</b></span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/40">
                      <tr className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                        <th className="px-5 py-3">Attribute</th>
                        <th className="px-5 py-3 text-center">Weight</th>
                        <th className="px-5 py-3 text-center">Category</th>
                        <th className="px-5 py-3">Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                      {sc.rows.map(r => (
                        <tr key={r.attr} className="text-xs">
                          <td className="px-5 py-2.5 font-bold text-zinc-800 dark:text-zinc-200">{r.attr}</td>
                          <td className="px-5 py-2.5 text-center font-mono font-black text-indigo-600 dark:text-indigo-400">{r.weight}</td>
                          <td className="px-5 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${catChip(r.category)}`}>{r.category}</span>
                          </td>
                          <td className="px-5 py-2.5 text-zinc-500 dark:text-zinc-400 text-[11px]">{r.level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 4. Attribute dictionary */}
      <Section id="attributes" title="4. Master Attribute Dictionary" subtitle="Every attribute the system uses, with pass/fail criteria and notes">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search attribute, category, or applicable call type…"
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none focus:border-indigo-500 placeholder:text-zinc-400"
          />
        </div>
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[1100px]">
              <thead className="bg-zinc-50 dark:bg-zinc-900/40 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Attribute</th>
                  <th className="px-4 py-3 text-center">Cat</th>
                  <th className="px-4 py-3">Applies To</th>
                  <th className="px-4 py-3 text-center">LtZ</th>
                  <th className="px-4 py-3">Definition</th>
                  <th className="px-4 py-3">Pass</th>
                  <th className="px-4 py-3">Fail</th>
                  <th className="px-4 py-3">QA Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900 text-[11px]">
                {filteredAttrs.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-zinc-400 text-xs">No attributes match your search.</td></tr>
                ) : filteredAttrs.map((a, idx) => (
                  <tr key={`${a.attr}-${idx}`} className="align-top">
                    <td className="px-4 py-3 font-black text-zinc-900 dark:text-white whitespace-nowrap">{a.attr}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${catChip(a.category)}`}>{a.category}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{a.applies}</td>
                    <td className="px-4 py-3 text-center">
                      {a.ltz ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white">YES</span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{a.definition}</td>
                    <td className="px-4 py-3 text-emerald-700 dark:text-emerald-400">{a.pass}</td>
                    <td className="px-4 py-3 text-rose-600 dark:text-rose-400">{a.fail}</td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-500 italic">{a.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* 5. SOP Flows */}
      <Section id="sop" title="5. SOP Manual" subtitle="Required call flow for each call type">
        <div className="space-y-3">
          {SOP_FLOWS.map(s => (
            <div key={s.call_type} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">{s.call_type}</p>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 leading-relaxed">{s.flow}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 6. Scoring Rules */}
      <Section id="rules" title="6. Scoring Rules" subtitle="How the final score is computed">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
          <ol className="space-y-3">
            {SCORING_RULES.map((rule, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                <span className="leading-relaxed">{rule}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">Formula</p>
            <code className="text-xs font-mono text-zinc-800 dark:text-zinc-200">
              Final Score = (Σ weights of passed attributes) / (Σ all weights) × 100
            </code>
          </div>
        </div>
      </Section>

      <div className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 py-6">
        QA & Customer Service Manual v1.0 · Internal reference · Swish QA System
      </div>
    </div>
  );
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <div className="mb-4">
        <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">{title}</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mt-1">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
