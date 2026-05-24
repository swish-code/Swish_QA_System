import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  BarChart3, 
  Award, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  SlidersHorizontal,
  Download,
  Calendar,
  Layers,
  PhoneCall,
  UserCheck,
  CheckCircle2,
  PieChart as PieIcon,
  HelpCircle,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { motion } from 'motion/react';

interface SummaryData {
  totalEvaluations: number;
  averageScore: number;
  satisfactoryRate: number;
  criticalFailCount: number;
  criticalFailRate: number;
  averageScoreExcludingCritical: number;
}

interface TrendItem {
  date: string;
  score: number;
  count: number;
  criticals: number;
}

interface GroupItem {
  name: string;
  score: number;
  count: number;
}

interface AgentItem {
  name: string;
  id: number;
  score: number;
  count: number;
  criticals: number;
}

interface QAItem {
  name: string;
  id: number;
  score: number;
  count: number;
}

interface PieItem {
  name: string;
  value: number;
}

interface ComplianceItem {
  id: string;
  label: string;
  section: string;
  yes: number;
  no: number;
  na: number;
  total: number;
  complianceRate: number;
}

interface FiltersOptions {
  brands: string[];
  callTypes: string[];
  agents: { id: number; display_name: string }[];
  qas: { id: number; display_name: string }[];
}

export default function Analysis() {
  // Filters state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [brand, setBrand] = useState('all');
  const [callType, setCallType] = useState('all');
  const [agentId, setAgentId] = useState('all');
  const [qaId, setQaId] = useState('all');
  const [status, setStatus] = useState('all');

  // Selected filters options (populated from API)
  const [filterOptions, setFilterOptions] = useState<FiltersOptions>({
    brands: [],
    callTypes: [],
    agents: [],
    qas: []
  });

  const [isLoading, setIsLoading] = useState(true);
  
  // Aggregated analytics data
  const [summary, setSummary] = useState<SummaryData>({
    totalEvaluations: 0,
    averageScore: 0,
    satisfactoryRate: 0,
    criticalFailCount: 0,
    criticalFailRate: 0,
    averageScoreExcludingCritical: 0
  });
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [byBrand, setByBrand] = useState<GroupItem[]>([]);
  const [byCallType, setByCallType] = useState<GroupItem[]>([]);
  const [byAgent, setByAgent] = useState<AgentItem[]>([]);
  const [byQA, setByQA] = useState<QAItem[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<PieItem[]>([]);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);

  // Search inside tables
  const [agentSearch, setAgentSearch] = useState('');
  const [criteriaSearch, setCriteriaSearch] = useState('');

  // Tab views or expand states
  const [showLowComplianceOnly, setShowLowComplianceOnly] = useState(false);

  useEffect(() => {
    fetchAnalysisData();
  }, [startDate, endDate, brand, callType, agentId, qaId, status]);

  const fetchAnalysisData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        brand,
        call_type: callType,
        agent_id: agentId,
        qa_id: qaId,
        status
      });

      const res = await fetch(`/api/stats/analysis?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setTrend(data.trend);
        setByBrand(data.byBrand);
        setByCallType(data.byCallType);
        setByAgent(data.byAgent);
        setByQA(data.byQA);
        setStatusDistribution(data.statusDistribution);
        setCompliance(data.criteriaCompliance);
        setFilterOptions(data.filters);
      }
    } catch (err) {
      console.error("Error loading quality analysis records:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setBrand('all');
    setCallType('all');
    setAgentId('all');
    setQaId('all');
    setStatus('all');
  };

  // Recharts color palettes
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#06b6d4'];
  const STATUS_COLORS: { [key: string]: string } = {
    'Completed': '#10b981',
    'Pending Review': '#f59e0b',
    'Pending TL Response': '#a855f7',
    'Approved': '#6366f1',
    'Reevaluation Requested': '#3b82f6',
    'Escalated': '#f43f5e'
  };

  // Filter lists based on inside search strings
  const filteredAgents = byAgent.filter(a => 
    a.name.toLowerCase().includes(agentSearch.toLowerCase())
  );

  const filteredCompliance = compliance.filter(c => {
    const matchesSearch = c.label.toLowerCase().includes(criteriaSearch.toLowerCase()) || 
                          c.section.toLowerCase().includes(criteriaSearch.toLowerCase());
    if (showLowComplianceOnly) {
      return matchesSearch && c.complianceRate < 85;
    }
    return matchesSearch;
  });

  // Calculate generic grades
  const getGradeInfo = (score: number) => {
    if (score >= 95) return { grade: 'Exemplary', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' };
    if (score >= 85) return { grade: 'Satisfactory', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20' };
    if (score >= 70) return { grade: 'Needs Coaching', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' };
    return { grade: 'Critical Alert', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20' };
  };

  // Export fully calculated analysis variables for external reports
  const handleExportQualityCSV = () => {
    if (compliance.length === 0) {
      alert("No compliance criteria statistics available to export.");
      return;
    }
    const csvRows = [
      ['Criteria Audit Key', 'Section Group', 'Yes Count', 'No Count', 'N/A Count', 'Total Count', 'Compliance Rate (%)']
    ];
    compliance.forEach(c => {
      csvRows.push([
        `"${c.label.replace(/"/g, '""')}"`,
        `"${c.section}"`,
        c.yes,
        c.no,
        c.na,
        c.total,
        `${c.complianceRate}%`
      ]);
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Mainframe_QualityCriteria_Analysis_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
            <h2 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">
              Performance Analysis Engine
            </h2>
          </div>
          <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] ml-4">
            Advanced multi-dimensional metrics, compliance metrics & calibrative analytics
          </p>
        </div>

        <button
          onClick={handleExportQualityCSV}
          className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md italic hover:scale-[1.02]"
        >
          <FileSpreadsheet size={14} /> Export Criteria Metrics
        </button>
      </div>

      {/* Control Deck (Complex Interactive Filters Interface) */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-md space-y-6">
        <h3 className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-600 tracking-[0.2em] flex items-center gap-2">
          <SlidersHorizontal size={14} /> Metric Fine-Tuning Controls
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {/* Start Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Date From</label>
            <input 
              type="date" 
              className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-bold outline-none text-zinc-700 dark:text-zinc-300 focus:border-indigo-600 shadow-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Date To</label>
            <input 
              type="date" 
              className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-bold outline-none text-zinc-700 dark:text-zinc-300 focus:border-indigo-600 shadow-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* Brand */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Brand / LOB</label>
            <select
              className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-black uppercase outline-none text-zinc-500 hover:text-indigo-600 shadow-sm cursor-pointer"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="all">ALL BRANDS</option>
              {filterOptions.brands.map(b => (
                <option key={b} value={b}>{b.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Channel Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Channel Type</label>
            <select
              className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-black uppercase outline-none text-zinc-500 hover:text-indigo-600 shadow-sm cursor-pointer"
              value={callType}
              onChange={(e) => setCallType(e.target.value)}
            >
              <option value="all">ALL CHANNELS</option>
              {filterOptions.callTypes.map(ct => (
                <option key={ct} value={ct}>{ct.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Agent */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Agent Name</label>
            <select
              className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-black uppercase outline-none text-zinc-500 hover:text-indigo-600 shadow-sm cursor-pointer"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="all">ALL AGENTS</option>
              {filterOptions.agents.map(ag => (
                <option key={ag.id} value={ag.id.toString()}>{ag.display_name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* QA Auditor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">QA Auditor</label>
            <select
              className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-black uppercase outline-none text-zinc-500 hover:text-indigo-600 shadow-sm cursor-pointer"
              value={qaId}
              onChange={(e) => setQaId(e.target.value)}
            >
              <option value="all">ALL AUDITORS</option>
              {filterOptions.qas.map(qa => (
                <option key={qa.id} value={qa.id.toString()}>{qa.display_name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5 pt-4 sm:pt-0">
            <span className="hidden sm:inline-block text-[9px] h-3.5">&nbsp;</span>
            <button
              onClick={handleResetFilters}
              className="w-full bg-zinc-150 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-black uppercase tracking-wider py-3.5 rounded-2xl italic transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <RefreshCw size={12} /> Clear Deck
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-24 rounded-3xl text-center shadow-sm">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-4" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 italic">Compiling multi-dimensional aggregations, please wait...</p>
        </div>
      ) : summary.totalEvaluations === 0 ? (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-24 rounded-3xl text-center shadow-sm flex flex-col items-center justify-center">
          <AlertTriangle size={48} className="text-zinc-200 dark:text-zinc-800 mb-4" />
          <p className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] italic">No evaluation payload matches the specified filters</p>
          <button 
            onClick={handleResetFilters}
            className="mt-6 text-[10px] font-black uppercase tracking-wider bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-6 py-3 rounded-2xl transition-all"
          >
            Clear Selected Parameters and Try Again
          </button>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {/* Bento summary KPIs framework */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Total Evaluations */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 dark:bg-indigo-950/10 rounded-full translate-x-1/3 -translate-y-1/3 group-hover:scale-125 transition-transform" />
              <Layers size={18} className="text-indigo-600 dark:text-indigo-400 relative z-10" />
              <div className="mt-4 relative z-10">
                <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Core Audit Volume</span>
                <span className="text-3xl font-black text-zinc-900 dark:text-white mt-1 tracking-tight italic block">
                  {summary.totalEvaluations}
                </span>
                <span className="text-[8.5px] text-zinc-400 block mt-2 uppercase font-bold">Documented Evaluations</span>
              </div>
            </div>

            {/* Quality Average Score */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 dark:bg-emerald-950/10 rounded-full translate-x-1/3 -translate-y-1/3 group-hover:scale-125 transition-transform" />
              <Award size={18} className="text-emerald-500 dark:text-emerald-400 relative z-10" />
              <div className="mt-4 relative z-10">
                <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Average Score KPI</span>
                <span className="text-3xl font-black text-emerald-500 dark:text-emerald-400 mt-1 tracking-tight italic block">
                  {summary.averageScore}%
                </span>
                <span className="text-[8.5px] text-zinc-400 block mt-2 uppercase font-bold">Benchmark target: 85%</span>
              </div>
            </div>

            {/* Satisfactory compliance rate target score >= 85 */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 dark:bg-teal-950/10 rounded-full translate-x-1/3 -translate-y-1/3 group-hover:scale-125 transition-transform" />
              <CheckCircle2 size={18} className="text-teal-600 dark:text-teal-400 relative z-10" />
              <div className="mt-4 relative z-10">
                <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Conformance Rate</span>
                <span className="text-3xl font-black text-teal-600 dark:text-teal-400 mt-1 tracking-tight italic block">
                  {summary.satisfactoryRate}%
                </span>
                <span className="text-[8.5px] text-zinc-400 block mt-2 uppercase font-bold">Evaluations &ge; 85% Score</span>
              </div>
            </div>

            {/* Critical Auto-Failure Percent */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 dark:bg-rose-950/10 rounded-full translate-x-1/3 -translate-y-1/3 group-hover:scale-125 transition-transform" />
              <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400 relative z-10" />
              <div className="mt-4 relative z-10">
                <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Critical Defect Rate</span>
                <span className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-1 tracking-tight italic block">
                  {summary.criticalFailRate}%
                </span>
                <span className="text-[8.5px] text-zinc-400 block mt-2 uppercase font-bold">{summary.criticalFailCount} absolute infractions</span>
              </div>
            </div>

            {/* Average excluding Auto-Fail compliance triggers */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 dark:bg-amber-950/10 rounded-full translate-x-1/3 -translate-y-1/3 group-hover:scale-125 transition-transform" />
              <SlidersHorizontal size={18} className="text-amber-500 relative z-10" />
              <div className="mt-4 relative z-10">
                <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest block">Clean Skill Performance</span>
                <span className="text-3xl font-black text-zinc-800 dark:text-zinc-200 mt-1 tracking-tight italic block">
                  {summary.averageScoreExcludingCritical}%
                </span>
                <span className="text-[8.5px] text-zinc-400 block mt-2 uppercase font-bold">Excludes auto-fails</span>
              </div>
            </div>
          </div>

          {/* Row 1 Charts Frame : General Performance Trend line */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Trend Line (Take 2 columns) */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-md lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-900 dark:text-white tracking-wider flex items-center gap-2 italic">
                    <TrendingUp size={16} className="text-indigo-600" /> Quality Trajectory Over Time
                  </h3>
                  <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest block mt-0.5">Chronological Quality Score and Audit Frequency tracker</span>
                </div>
              </div>

              <div className="h-80 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" className="hidden dark:block" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      domain={[50, 100]} 
                      tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        backgroundColor: 'rgba(9, 9, 11, 0.95)', 
                        border: 'none', 
                        fontSize: '11px', 
                        color: 'white',
                        fontWeight: 'bold' 
                      }} 
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      name="Average Score (%)" 
                      stroke="#6366f1" 
                      strokeWidth={3} 
                      activeDot={{ r: 8 }} 
                      dot={{ r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      name="Audit Count" 
                      stroke="#10b981" 
                      strokeWidth={1.5} 
                      dot={{ r: 1 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Workflow status distributions pie-chart */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-md flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase text-zinc-900 dark:text-white tracking-wider flex items-center gap-2 italic">
                  <PieIcon size={16} className="text-amber-500" /> Audit Workflow States
                </h3>
                <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest block mt-0.5">Distribution of quality validations in pipeline</span>
              </div>

              {statusDistribution.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-[10px] uppercase font-black tracking-wider text-zinc-300 italic">No status details logged</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 items-center">
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {statusDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '12px', 
                            backgroundColor: 'rgba(9, 9, 11, 0.9)', 
                            border: 'none', 
                            fontSize: '10px', 
                            color: 'white' 
                          }} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Status Legend */}
                  <div className="space-y-1.5 text-xs text-left max-h-48 overflow-y-auto pr-1">
                    {statusDistribution.map((entry, index) => (
                      <div key={entry.name} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[entry.name] || COLORS[index % COLORS.length] }} />
                          <span className="font-extrabold uppercase text-[9px] text-zinc-500">{entry.name}</span>
                        </div>
                        <span className="font-bold text-xs text-zinc-700 dark:text-zinc-300 italic">{entry.value} audits</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2 Bento: Side-by-side Segment comparison charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* LOB / Brand comparison */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-md space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase text-zinc-900 dark:text-white tracking-wider flex items-center gap-2 italic">
                  <Layers size={16} className="text-teal-600" /> Score Breakdown by Brand / LOB
                </h3>
                <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest block mt-0.5">Average Quality rating mapped against volume per Brand</span>
              </div>

              <div className="h-60 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byBrand} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" className="hidden dark:block" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', backgroundColor: 'rgba(9, 9, 11, 0.9)', border: 'none', fontSize: '10px', color: 'white' }} />
                    <Bar dataKey="score" name="Average QualityScore (%)" fill="#6366f1" radius={[8, 8, 0, 0]}>
                      {byBrand.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Channels/Call Type analysis */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-md space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase text-zinc-900 dark:text-white tracking-wider flex items-center gap-2 italic">
                  <PhoneCall size={16} className="text-indigo-600" /> Channel Metrics (Call vs Email vs Chat)
                </h3>
                <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest block mt-0.5">Process scores achieved based on communication channels</span>
              </div>

              <div className="h-60 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCallType} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" className="hidden dark:block" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', backgroundColor: 'rgba(9, 9, 11, 0.9)', border: 'none', fontSize: '10px', color: 'white' }} />
                    <Bar dataKey="score" name="Channel QualityScore (%)" fill="#10b981" radius={[8, 8, 0, 0]}>
                      {byCallType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 3 - Granular Process Compliance / Weak Point Drilldown Checklist */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 rounded-3xl shadow-md overflow-hidden">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase text-zinc-900 dark:text-white tracking-wider flex items-center gap-2 italic">
                  <AlertTriangle size={16} className="text-rose-500" /> Process Compliance & Dynamic Weak Point Analysis
                </h3>
                <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest block mt-0.5">Detailed pass rates of each check-item based on live evaluation data</span>
              </div>

              {/* Filters for weak points */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Search check items */}
                <div className="relative">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search criteria label..."
                    className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs font-bold outline-none text-zinc-700 dark:text-zinc-300"
                    value={criteriaSearch}
                    onChange={(e) => setCriteriaSearch(e.target.value)}
                  />
                </div>

                {/* Filter low compliance only */}
                <button
                  onClick={() => setShowLowComplianceOnly(!showLowComplianceOnly)}
                  className={`px-4 py-2 border rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    showLowComplianceOnly 
                      ? 'bg-rose-500 text-white border-rose-500' 
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-indigo-600'
                  }`}
                >
                  {showLowComplianceOnly ? 'Showing Weak Points Only (< 85%)' : 'Show All Questions'}
                </button>
              </div>
            </div>

            {filteredCompliance.length === 0 ? (
              <div className="p-20 text-center text-xs font-bold uppercase tracking-wider text-zinc-300 italic">No checklist elements fit selected filters</div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-850 max-h-96 overflow-y-auto pr-1">
                {filteredCompliance.map((item) => {
                  const complianceColor = 
                    item.complianceRate >= 90 ? 'bg-emerald-500' :
                    item.complianceRate >= 80 ? 'bg-indigo-500' :
                    item.complianceRate >= 65 ? 'bg-amber-500' : 'bg-rose-500';

                  return (
                    <div key={item.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors">
                      <div className="space-y-1.5 flex-1 pr-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[8px] font-black tracking-wider bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 px-2 py-0.5 rounded-md uppercase">
                            {item.section}
                          </span>
                          <span className="text-[8.5px] font-mono text-zinc-300 dark:text-zinc-700 font-black uppercase">
                            ID: #{item.id}
                          </span>
                        </div>
                        <p className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-tight italic">{item.label}</p>
                        <p className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wide">
                          Total Valid Responses: {item.yes + item.no} (Yes: {item.yes} | No: {item.no} | N/A: {item.na})
                        </p>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        {/* Progress Bar Container */}
                        <div className="flex-1 sm:w-48 max-w-xs space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase">
                            <span className="text-zinc-400">Pass Rate Compliance</span>
                            <span className={`italic font-mono ${
                              item.complianceRate >= 90 ? 'text-emerald-500' :
                              item.complianceRate >= 80 ? 'text-indigo-500' :
                              item.complianceRate >= 65 ? 'text-amber-500' : 'text-rose-500'
                            }`}>{item.complianceRate}%</span>
                          </div>
                          
                          <div className="w-full bg-slate-100 dark:bg-zinc-900 h-2.5 rounded-full overflow-hidden">
                            <div className={`${complianceColor} h-full rounded-full`} style={{ width: `${item.complianceRate}%` }} />
                          </div>
                        </div>

                        {/* Critical Warning Flag */}
                        {item.complianceRate < 80 && (
                          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-500 flex items-center justify-center animate-pulse" title="High failure rate attention required">
                            <AlertTriangle size={14} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Row 4 Bento: Agents leaderboard & Evaluators calibrator */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Agent compliance leaderboard */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 rounded-3xl shadow-md xl:col-span-2 overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black uppercase text-zinc-900 dark:text-white tracking-wider flex items-center gap-2 italic">
                      <UserCheck size={16} className="text-indigo-600" /> Authorized Agent Quality Leaderboard
                    </h3>
                    <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest block mt-0.5">Ranking list of operational staff by audit metrics</span>
                  </div>

                  {/* Search bar */}
                  <div className="relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search agents..."
                      className="bg-slate-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs font-bold outline-none text-zinc-700 dark:text-zinc-300"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-zinc-950/20 text-zinc-400 dark:text-zinc-650 text-[9px] uppercase font-black tracking-widest italic border-b border-zinc-100 dark:border-zinc-850">
                        <th className="px-6 py-4">Agent Name</th>
                        <th className="px-6 py-4">Audits count</th>
                        <th className="px-6 py-4">Critical fails</th>
                        <th className="px-6 py-4">Grade rating</th>
                        <th className="px-6 py-4 text-right pr-8">Avg Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                      {filteredAgents.map((ag) => {
                        const gradeDetails = getGradeInfo(ag.score);
                        return (
                          <tr key={ag.name} className="hover:bg-zinc-50/40 dark:hover:bg-zinc-900/10 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-tight italic">{ag.name}</span>
                            </td>
                            <td className="px-6 py-4 text-xs font-semibold text-zinc-500">{ag.count} evaluations</td>
                            <td className="px-6 py-4">
                              {ag.criticals > 0 ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/20 text-[9px] font-black uppercase">
                                  {ag.criticals} infraction
                                </span>
                              ) : (
                                <span className="text-zinc-300 dark:text-zinc-750 text-[10px] font-bold italic">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-block px-2.5 py-1 rounded-xl text-[8.5px] font-black uppercase tracking-widest ${gradeDetails.color}`}>
                                {gradeDetails.grade}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right pr-8">
                              <span className={`text-sm font-black italic ${
                                ag.score >= 85 ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-800 dark:text-zinc-200'
                              }`}>{ag.score}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* QA calibrator details */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 p-6 rounded-3xl shadow-md space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase text-zinc-900 dark:text-white tracking-wider flex items-center gap-2 italic">
                  <UserCheck size={16} className="text-purple-600" /> QA Auditor Calibration & Strictly Grading
                </h3>
                <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest block mt-0.5">Validating evaluations quantity and grading levels of QA Team</span>
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {byQA.map((qaItem, index) => (
                  <div key={qaItem.name} className="p-4 bg-slate-50/50 dark:bg-zinc-900/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Auditor #{qaItem.id || (index+1)}</span>
                      <p className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-tight italic">{qaItem.name}</p>
                      <p className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wide">Graded: {qaItem.count} audits</p>
                    </div>

                    <div className="text-right">
                      <span className="text-2xl font-black italic text-indigo-600 dark:text-indigo-400 block">{qaItem.score}%</span>
                      <span className="text-[8px] uppercase tracking-widest text-zinc-300 font-extrabold block">Avg Grade Strictness</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
