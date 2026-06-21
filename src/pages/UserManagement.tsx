import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Search, Edit2, Trash2, Filter, X } from 'lucide-react';
import { motion } from 'motion/react';
import { User, UserRole, Department } from '../types';
import MultiSelectField from '../components/MultiSelectField';

type FormState = {
  display_name: string;
  username: string;
  password: string;
  role: UserRole;
  department: Department;
  tl_id: string;
  allowed_departments: string[];
  allowed_brands: string[];
};

const initialForm = (): FormState => ({
  display_name: '',
  username: '',
  password: '',
  role: 'agent',
  department: 'Swish',
  tl_id: '',
  allowed_departments: [],
  allowed_brands: [],
});

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [brands, setBrands] = useState<{ value: string; label: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormState>(initialForm());
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const roles: UserRole[] = ['supervisor', 'qa', 'tl', 'agent'];
  const departments: Department[] = ['Swish', 'Mishmash', 'FM', 'Complain', 'TEC'];
  const departmentOptions = departments.map(d => ({ value: d, label: d }));

  useEffect(() => {
    fetchUsers();
    fetchBrands();
  }, []);

  const fetchUsers = async () => {
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(data);
  };

  // Load brand list from form_settings so the multi-select matches the
  // brands available throughout the rest of the app (single source of truth).
  const fetchBrands = async () => {
    try {
      const res = await fetch('/api/settings/form');
      const settings = await res.json();
      const brandRows = (settings as any[])
        .filter(s => s.field_type === 'brand' && s.is_active)
        .map(s => ({ value: s.value, label: s.label_en || s.value }));
      setBrands(brandRows);
    } catch (err) {
      console.error('Failed to fetch brands', err);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(initialForm());
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditingId(u.id);
    setFormData({
      display_name: u.display_name,
      username: u.username,
      password: '',
      role: u.role,
      department: u.department,
      tl_id: u.tl_id ? String(u.tl_id) : '',
      allowed_departments: u.allowed_departments || [],
      allowed_brands: u.allowed_brands || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Role-specific required-scope checks. The server also enforces these
    // (a TL with no brands sees nothing) — this just gives the admin an
    // immediate, explicit error instead of a silently-broken account.
    if (formData.role === 'tl' && formData.allowed_brands.length === 0) {
      alert('Team Leader users must have at least one assigned brand.');
      return;
    }
    if (formData.role === 'qa' && (formData.allowed_brands.length === 0 || formData.allowed_departments.length === 0)) {
      alert('QA users must have at least one allowed department AND one allowed brand.');
      return;
    }

    const payload = { ...formData };
    const url = editingId ? `/api/users/${editingId}` : '/api/users';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setShowModal(false);
      setEditingId(null);
      setFormData(initialForm());
      fetchUsers();
    } else {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      alert(err.error || 'Failed to save user');
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchUsers();
      setConfirmDelete(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.display_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="space-y-12 max-w-[1600px] mx-auto" dir="ltr">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-10">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">User Accounts</h2>
          </div>
          <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] ml-4">Manage user accounts, roles, and system permission levels</p>
        </div>
        <button
          onClick={openCreate}
          className="group px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/10 active:scale-95 transition-all flex items-center gap-3 italic overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <span className="relative z-10 flex items-center gap-3 group-hover:text-white transition-colors">
            <UserPlus size={18} />
            Add User
          </span>
        </button>
      </div>

      <div className="glass-card !p-0 overflow-hidden">
        <div className="p-4 sm:p-6 lg:p-8 border-b border-zinc-100 dark:border-zinc-800/50 flex flex-col md:flex-row gap-6 items-center justify-between bg-zinc-50/30 dark:bg-zinc-950/20">
          <div className="relative w-full md:w-[480px] group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search user by name or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-16 pr-6 py-4 text-xs font-black uppercase tracking-tight outline-none focus:border-indigo-600 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 italic shadow-sm"
            />
          </div>
          <div className="flex gap-4">
            <button className="flex items-center gap-3 px-8 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-indigo-600 dark:hover:text-white transition-all shadow-sm italic hover:border-indigo-600/30">
              <Filter size={14} /> Filter Users
            </button>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-left min-w-[840px]">
            <thead>
              <tr className="bg-zinc-50/50 dark:bg-zinc-950/30 text-zinc-400 dark:text-zinc-600 text-[10px] uppercase font-black tracking-[0.2em] italic border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-10 py-6">User Name</th>
                <th className="px-10 py-6">Username</th>
                <th className="px-10 py-6">Role</th>
                <th className="px-10 py-6">Department</th>
                <th className="px-10 py-6">Access Scope</th>
                <th className="px-10 py-6 text-right pr-14">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-indigo-600/5 group">
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[12px] font-black text-indigo-600 group-hover:border-indigo-600 group-hover:scale-105 shadow-sm italic">
                        {u.display_name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic">{u.display_name}</p>
                        <p className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-[0.2em] mt-1">Active User</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <span className="text-zinc-400 dark:text-zinc-500 text-[11px] font-mono font-bold uppercase tracking-widest bg-zinc-50 dark:bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
                      {u.username}
                    </span>
                  </td>
                  <td className="px-10 py-8">
                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] italic border ${
                      u.role === 'supervisor' ? 'bg-rose-500/5 text-rose-600 border-rose-500/10' :
                      u.role === 'qa' ? 'bg-indigo-500/5 text-indigo-600 border-indigo-500/10' :
                      u.role === 'tl' ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/10' :
                      'bg-slate-50 dark:bg-zinc-900 text-zinc-500 border-slate-200 dark:border-zinc-800'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        u.role === 'supervisor' ? 'bg-rose-500' :
                        u.role === 'qa' ? 'bg-indigo-500' :
                        u.role === 'tl' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`} />
                      {u.role}
                    </div>
                  </td>
                  <td className="px-10 py-8 whitespace-nowrap">
                    <span className="text-zinc-600 dark:text-zinc-400 text-[10px] font-black uppercase tracking-widest">{u.department}</span>
                  </td>
                  <td className="px-10 py-8">
                    {u.role === 'qa' ? (
                      <div className="space-y-1.5 max-w-[260px]">
                        <div className="flex flex-wrap gap-1">
                          {(u.allowed_departments || []).length === 0 ? (
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">No depts</span>
                          ) : (u.allowed_departments || []).map(d => (
                            <span key={`d-${d}`} className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">{d}</span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(u.allowed_brands || []).length === 0 ? (
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">No brands</span>
                          ) : (u.allowed_brands || []).map(b => (
                            <span key={`b-${b}`} className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">{b}</span>
                          ))}
                        </div>
                      </div>
                    ) : u.role === 'tl' ? (
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {(u.allowed_brands || []).length === 0 ? (
                          <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">No brands</span>
                        ) : (u.allowed_brands || []).map(b => (
                          <span key={`tl-b-${b}`} className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">{b}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-700 text-[10px] font-black uppercase tracking-widest">N/A</span>
                    )}
                  </td>
                  <td className="px-10 py-8 pr-14 text-right">
                    <div className="flex justify-end gap-3 transition-all">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 hover:text-indigo-600 hover:border-indigo-600/30 transition-all shadow-sm"
                        title="Edit user"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u.id)}
                        className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 hover:text-rose-600 hover:border-rose-600/30 transition-all shadow-sm"
                        title="Delete user"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="py-24 text-center">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em] italic">No users found</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete !== null && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter mb-2">Delete User?</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">This permanently removes the user from the system. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-black text-[10px] uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowModal(false)}
            className="absolute inset-0 bg-black/70 dark:bg-black/90 backdrop-blur-xl"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 40 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.4)] relative my-auto z-10"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-gradient-to-r from-transparent via-indigo-600 to-transparent" />

            <div className="p-6 sm:p-8 lg:p-12 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/30 dark:bg-zinc-950/20 relative">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-black dark:bg-white rounded-2xl flex items-center justify-center shadow-2xl">
                    <UserPlus size={32} className="text-white dark:text-black" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter italic">
                      {editingId ? 'Edit User' : 'Add New User'}
                    </h3>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest mt-1">
                      {editingId ? 'Update user account and access scope' : 'Register a new user to the system'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-zinc-400 hover:text-rose-500 transition-all hover:border-rose-500/30"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 sm:p-8 lg:p-12 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1 flex items-center gap-2 italic">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    className="w-full bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-6 py-5 text-sm font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-600 shadow-inner placeholder:text-zinc-300 dark:placeholder:text-zinc-800 italic"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1 flex items-center gap-2 italic">Username</label>
                  <input
                    type="text"
                    placeholder="e.g. johndoe"
                    className="w-full bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-6 py-5 text-sm font-mono font-black text-indigo-600 dark:text-indigo-400 outline-none focus:border-indigo-600 shadow-inner placeholder:text-zinc-300 dark:placeholder:text-zinc-800 italic"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1 flex items-center gap-2 italic">
                    Password {editingId && <span className="text-zinc-300 dark:text-zinc-700 normal-case tracking-normal">(leave blank to keep)</span>}
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-6 py-5 text-sm font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-600 shadow-inner"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingId}
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1 flex items-center gap-2 italic">Role</label>
                  <select
                    className="w-full bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-6 py-5 text-sm font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-600 appearance-none cursor-pointer shadow-inner italic"
                    value={formData.role}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      setFormData({ ...formData, role, tl_id: role === 'agent' ? formData.tl_id : '' });
                    }}
                  >
                    {roles.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                  </select>
                </div>

                {formData.role !== 'agent' && (
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1 flex items-center gap-2 italic">Department</label>
                    <select
                      className="w-full bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-6 py-5 text-sm font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-600 appearance-none cursor-pointer shadow-inner italic"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value as Department })}
                    >
                      {departments.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}

                {formData.role === 'agent' && (
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1 flex items-center gap-2 italic">Team Leader</label>
                    <select
                      className="w-full bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-6 py-5 text-sm font-black text-zinc-900 dark:text-white outline-none focus:border-indigo-600 appearance-none cursor-pointer shadow-inner italic"
                      value={formData.tl_id}
                      onChange={(e) => setFormData({ ...formData, tl_id: e.target.value })}
                      required
                    >
                      <option value="">SELECT TEAM LEADER</option>
                      {users.filter(u => u.role === 'tl').map(tl => (
                        <option key={tl.id} value={tl.id}>{tl.display_name.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* QA-only scope picker — departments + brands */}
              {formData.role === 'qa' && (
                <div className="space-y-6 p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/20">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400 italic">QA Access Scope</p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1">This QA can only see evaluations whose <b>brand</b> is in the allowed list <b>and</b> whose agent belongs to one of the allowed departments. Empty lists = no access.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <MultiSelectField
                      label="Allowed Departments"
                      placeholder="Select one or more departments…"
                      options={departmentOptions}
                      value={formData.allowed_departments}
                      onChange={(v) => setFormData({ ...formData, allowed_departments: v })}
                    />
                    <MultiSelectField
                      label="Allowed Brands"
                      placeholder="Select one or more brands…"
                      options={brands}
                      value={formData.allowed_brands}
                      onChange={(v) => setFormData({ ...formData, allowed_brands: v })}
                    />
                  </div>

                  {(formData.allowed_departments.length === 0 || formData.allowed_brands.length === 0) && (
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">
                      ⚠ With no departments OR no brands selected, this QA will see nothing.
                    </div>
                  )}
                </div>
              )}

              {/* TL-only scope picker — brands only (team comes from agent.tl_id) */}
              {formData.role === 'tl' && (
                <div className="space-y-6 p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/20">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400 italic">TL Brand Access</p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1">
                      This Team Leader can only see evaluations whose <b>brand</b> is in the allowed list.
                      At least one brand is required. The team-membership filter (their direct agents) still applies on top.
                    </p>
                  </div>

                  <MultiSelectField
                    label="Assigned Brands"
                    placeholder="Select one or more brands…"
                    options={brands}
                    value={formData.allowed_brands}
                    onChange={(v) => setFormData({ ...formData, allowed_brands: v })}
                  />

                  {formData.allowed_brands.length === 0 && (
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">
                      ⚠ At least one brand is required for a Team Leader.
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-4 pt-8 border-t border-zinc-100 dark:border-zinc-900 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-5 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 text-zinc-400 font-black text-[11px] uppercase tracking-[0.3em] hover:bg-rose-500/10 hover:text-rose-600 transition-all shadow-sm italic"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-5 rounded-3xl bg-indigo-600 text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl shadow-indigo-600/20 hover:bg-zinc-900 dark:hover:bg-white dark:hover:text-black active:scale-[0.98] transition-all flex items-center justify-center gap-4 italic"
                >
                  {editingId ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
