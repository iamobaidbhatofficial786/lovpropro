'use client';

import React, { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import { Key, Laptop, ShieldAlert, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface Stats {
  total: number;
  active: number;
  suspended: number;
  revoked: number;
  expired: number;
  devices: number;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  created_at: string;
  ip_address: string;
  country: string;
  details: any;
  licenses?: {
    plan_name: string;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentEvents, setRecentEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats);
        setRecentEvents(data.recentEvents);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#070b13] ml-64">
        <div className="text-slate-400 text-sm animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  const statCards = [
    { name: 'Total Licenses', value: stats?.total || 0, icon: Key, color: 'text-brand-500 bg-brand-500/10 border-brand-500/20' },
    { name: 'Active Devices', value: stats?.devices || 0, icon: Laptop, color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
    { name: 'Active Keys', value: stats?.active || 0, icon: CheckCircle, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    { name: 'Suspended Keys', value: stats?.suspended || 0, icon: AlertTriangle, color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    { name: 'Revoked Keys', value: stats?.revoked || 0, icon: XCircle, color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
    { name: 'Expired Keys', value: stats?.expired || 0, icon: ShieldAlert, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
  ];

  return (
    <AdminGuard>
      <div className="p-8 ml-64 bg-[#070b13] min-h-screen text-slate-200">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard Overview</h1>
            <p className="text-xs text-slate-400 mt-1">Real-time status of your extension license keys and activations</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold rounded-xl text-slate-300 transition-all active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.name} className="glass-card rounded-2xl p-6 border flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">{card.name}</span>
                  <span className="text-3xl font-extrabold text-white mt-2 block">{card.value}</span>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Threat Alert Panel */}
        <div className="glass-card rounded-2xl border border-slate-800/80 p-6">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            Recent Security & Tampering Events
          </h2>

          {recentEvents.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
              <span className="text-xs text-slate-500 block">No recent security warnings reported.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-4 px-4">Event Type</th>
                    <th className="py-4 px-4">Licensing Plan</th>
                    <th className="py-4 px-4">IP & Country</th>
                    <th className="py-4 px-4">Logged Time</th>
                    <th className="py-4 px-4">Threat Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {recentEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full font-semibold text-[10px] tracking-wide uppercase ${
                          event.event_type.includes('hijacking') || event.event_type.includes('tampering')
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {event.event_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-300 font-medium">
                        {event.licenses?.plan_name || 'N/A'}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {event.ip_address} <span className="text-slate-500">({event.country || 'Unknown'})</span>
                      </td>
                      <td className="py-4 px-4 text-slate-400">
                        {new Date(event.created_at).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-500 max-w-xs truncate" title={JSON.stringify(event.details)}>
                        {JSON.stringify(event.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
