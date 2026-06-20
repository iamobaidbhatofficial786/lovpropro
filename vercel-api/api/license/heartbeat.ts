import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../utils/supabase';
import { calculateAbuseScore, logSecurityEvent } from '../utils/abuse-detection';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Simple auth via ADMIN_SECRET header to prevent unauthorized trigger of full scans
  const authHeader = req.headers['authorization'] || '';
  const adminSecret = process.env.ADMIN_SECRET || '';

  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    // 1. Fetch active licenses
    const { data: licenses, error: licErr } = await supabase
      .from('licenses')
      .select('id, plan_name, status, notes')
      .eq('status', 'active');

    if (licErr) throw licErr;

    const auditResults: any[] = [];

    // 2. Scan abuse for each license
    if (licenses && licenses.length > 0) {
      for (const lic of licenses) {
        const report = await calculateAbuseScore(lic.id);
        
        if (report.level === 'High Risk' || report.level === 'Suspicious') {
          // Log security event
          await logSecurityEvent(
            lic.id,
            null,
            'abuse_detected',
            { score: report.score, level: report.level, flags: report.flags },
            'System',
            'System'
          );

          // Update notes with threat report
          const updatedNotes = `${lic.notes || ''}\n[SYSTEM AUDIT - ${new Date().toLocaleDateString()}]: Abuse Risk: ${report.level} (Score: ${report.score}). Flags: ${report.flags.join(', ')}`.trim();
          
          await supabase
            .from('licenses')
            .update({ notes: updatedNotes })
            .eq('id', lic.id);

          auditResults.push({
            license_id: lic.id,
            plan: lic.plan_name,
            level: report.level,
            score: report.score,
            flags: report.flags,
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      scanned_licenses: licenses?.length || 0,
      abuse_alerts: auditResults.length,
      alerts: auditResults,
    });
  } catch (err: any) {
    console.error('[API Heartbeat] Audit error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal audit error' });
  }
}
