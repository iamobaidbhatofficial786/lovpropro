'use client';

import React, { useState, useEffect } from 'react';
import AdminGuard from '../../components/AdminGuard';
import { Plus, Trash2, ShieldAlert, CheckCircle, Search, Edit2, Ban, ShieldCheck, X } from 'lucide-react';

interface License {
  id: string;
  plan_name: string;
  status: string;
  max_devices: number;
  activation_count: number;
  notes: string;
  created_at: string;
  expires_at: string | null;
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  
  // Form State
  const [planName, setPlanName] = useState('1 Device License');
  const [maxDevices, setMaxDevices] = useState(1);
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);

  const fetchLicenses = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`/api/admin/licenses?query=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLicenses(data.licenses);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, [searchQuery]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan_name: planName,
          max_devices: maxDevices,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          notes,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedKey(data.rawKey);
        setCreateModalOpen(false);
        setKeyModalOpen(true);
        fetchLicenses();
        // Reset form
        setPlanName('1 Device License');
        setMaxDevices(1);
        setExpiresAt('');
        setNotes('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLicense) return;

    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: selectedLicense.id,
          plan_name: planName,
          max_devices: maxDevices,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          notes,
        }),
      });

      if (res.ok) {
        setEditModalOpen(false);
        fetchLicenses();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch('/api/admin/licenses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, status }),
      });
      fetchLicenses();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this license? All associated devices will be unlinked.')) return;
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`/api/admin/licenses?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLicenses();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (license: License) => {
    setSelectedLicense(license);
    setPlanName(license.plan_name);
    setMaxDevices(license.max_devices);
    setExpiresAt(license.expires_at ? license.expires_at.split('T')[0] : '');
    setNotes(license.notes);
    setEditModalOpen(true);
  };

  return (
    <AdminGuard>
      <div className="p-8 ml-64 bg-[#070b13] min-h-screen text-slate-200">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">License Management</h1>
            <p className="text-xs text-slate-400 mt-1">Create and manage license keys for your users</p>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-xs font-bold rounded-xl text-white transition-all shadow-lg shadow-brand-600/25 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Create License
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by license key, plan name, or notes..."
              className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-20 text-slate-500 text-sm animate-pulse">Loading licenses...</div>
        ) : licenses.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
            <span className="text-sm text-slate-500">No licenses found matching your filters.</span>
          </div>
        ) : (
          <div className="glass-card rounded-2xl border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-4 px-6">ID / Plan</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Devices (Used/Max)</th>
                    <th className="py-4 px-6">Expires At</th>
                    <th className="py-4 px-6">Notes</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {licenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-bold text-white block">{lic.plan_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{lic.id}</span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase ${
                          lic.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : lic.status === 'suspended'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {lic.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-mono text-slate-300">
                        {lic.activation_count} / {lic.max_devices}
                      </td>
                      <td className="py-4 px-6 text-slate-400">
                        {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-4 px-6 text-slate-400 max-w-xs truncate" title={lic.notes}>
                        {lic.notes || '—'}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        {lic.status === 'active' ? (
                          <button
                            onClick={() => handleStatusUpdate(lic.id, 'suspended')}
                            title="Suspend Key"
                            className="p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors inline-block"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusUpdate(lic.id, 'active')}
                            title="Activate Key"
                            className="p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors inline-block"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusUpdate(lic.id, 'revoked')}
                          title="Revoke Key"
                          className="p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors inline-block"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(lic)}
                          title="Edit Info"
                          className="p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors inline-block"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(lic.id)}
                          title="Delete Key"
                          className="p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-rose-500 hover:bg-rose-500/15 transition-colors inline-block"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Create License */}
        {createModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-filter backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-white text-base">Generate New License Key</h3>
                <button onClick={() => setCreateModalOpen(false)} className="text-slate-500 hover:text-slate-350">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Plan Name</label>
                  <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Max Devices</label>
                  <input
                    type="number"
                    value={maxDevices}
                    onChange={(e) => setMaxDevices(parseInt(e.target.value))}
                    required
                    min={1}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Expiration Date (Optional)</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Admin Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="E.g. customer name, reseller ref..."
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
                >
                  Generate Key
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit License */}
        {editModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-filter backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-white text-base">Edit License Details</h3>
                <button onClick={() => setEditModalOpen(false)} className="text-slate-500 hover:text-slate-350">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleEdit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Plan Name</label>
                  <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Max Devices</label>
                  <input
                    type="number"
                    value={maxDevices}
                    onChange={(e) => setMaxDevices(parseInt(e.target.value))}
                    required
                    min={1}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Expiration Date (Optional)</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Admin Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
                >
                  Save Changes
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Display Generated Key */}
        {keyModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-filter backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <h3 className="font-bold text-white text-base text-center">New License Key Created!</h3>
              <p className="text-xs text-slate-400 text-center mt-2">
                Copy this key now. It is only displayed once and is encrypted in our database.
              </p>
              
              <div className="my-6 p-4 bg-slate-950 border border-slate-800 rounded-xl text-center">
                <span className="font-mono font-bold text-lg text-white select-all select-text tracking-wider">{generatedKey}</span>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedKey);
                    alert('Copied to clipboard!');
                  }}
                  className="flex-1 py-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-850 font-semibold rounded-xl text-xs transition-colors"
                >
                  Copy Key
                </button>
                <button
                  onClick={() => setKeyModalOpen(false)}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 font-semibold rounded-xl text-xs text-white transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
