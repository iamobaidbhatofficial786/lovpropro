'use client';

import React, { useState, useEffect } from 'react';
import AdminGuard from '../../components/AdminGuard';
import { Laptop, Trash2, Search, RefreshCw, ShieldCheck } from 'lucide-react';

interface Device {
  id: string;
  license_id: string;
  device_hash: string;
  ip_address: string;
  country: string;
  first_seen: string;
  last_seen: string;
  status: string;
  licenses?: {
    plan_name: string;
  };
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchDevices = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`/api/admin/devices?query=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDevices(data.devices);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [searchQuery]);

  const handleUnbind = async (id: string) => {
    if (!confirm('Are you sure you want to unbind/remove this device? The user session will be invalidated on their next check.')) return;
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`/api/admin/devices?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDevices();
  };

  return (
    <AdminGuard>
      <div className="p-8 ml-64 bg-[#070b13] min-h-screen text-slate-200">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Active Devices</h1>
            <p className="text-xs text-slate-400 mt-1">Audit and unbind hardware instances associated with license keys</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold rounded-xl text-slate-300 transition-all active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
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
              placeholder="Search by device hash, IP address, country..."
              className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-20 text-slate-500 text-sm animate-pulse">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
            <span className="text-sm text-slate-500">No active devices registered.</span>
          </div>
        ) : (
          <div className="glass-card rounded-2xl border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-4 px-6">Device Fingerprint</th>
                    <th className="py-4 px-6">License Plan</th>
                    <th className="py-4 px-6">IP & Geolocation</th>
                    <th className="py-4 px-6">First Seen</th>
                    <th className="py-4 px-6">Last Seen</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {devices.map((dev) => (
                    <tr key={dev.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-4 px-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-mono text-white font-semibold block max-w-xs truncate" title={dev.device_hash}>
                            {dev.device_hash.substring(0, 16)}...
                          </span>
                          <span className="text-[10px] text-slate-500 block">ID: {dev.id}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-300 font-semibold">
                        {dev.licenses?.plan_name || 'N/A'}
                        <span className="text-[10px] text-slate-500 block font-mono">{dev.license_id}</span>
                      </td>
                      <td className="py-4 px-6 font-mono text-slate-400">
                        {dev.ip_address} <span className="text-slate-500">({dev.country || 'Unknown'})</span>
                      </td>
                      <td className="py-4 px-6 text-slate-400">
                        {new Date(dev.first_seen).toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-slate-400">
                        {new Date(dev.last_seen).toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleUnbind(dev.id)}
                          title="Unbind Device"
                          className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors inline-flex items-center gap-1.5 text-[10px] font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Unbind
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
