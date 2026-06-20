import { supabase } from './supabase';

export interface AbuseReport {
  score: number;
  level: 'Normal' | 'Suspicious' | 'High Risk';
  flags: string[];
}

export async function calculateAbuseScore(licenseId: string): Promise<AbuseReport> {
  let score = 0;
  const flags: string[] = [];

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Fetch activations in past 7 days
    const { data: acts, error: actsErr } = await supabase
      .from('activations')
      .select('device_id, ip_address, country, created_at')
      .eq('license_id', licenseId)
      .gte('created_at', sevenDaysAgo);

    if (actsErr) throw actsErr;

    if (acts && acts.length > 0) {
      // Find distinct countries in the last 24 hours
      const recentCountries = new Set<string>();
      const recentDevices = new Set<string>();
      
      acts.forEach(a => {
        if (new Date(a.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000) {
          if (a.country) recentCountries.add(a.country);
        }
        if (a.device_id) recentDevices.add(a.device_id);
      });

      // Flag for multiple countries in short periods
      if (recentCountries.size > 1) {
        score += 50;
        flags.push(`Multiple countries (${Array.from(recentCountries).join(', ')}) in 24 hours`);
      }

      // Flag for frequent device changes (more than max_devices limit changes)
      if (recentDevices.size > 3) {
        score += 30;
        flags.push(`Accessed by ${recentDevices.size} distinct devices in last 7 days`);
      }

      // Flag for excessive verifications/heartbeats in past hour
      const pastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const hourActs = acts.filter(a => new Date(a.created_at).getTime() > Date.now() - 60 * 60 * 1000);
      if (hourActs.length > 60) {
        score += 20;
        flags.push(`Excessive requests (${hourActs.length}) in the past hour`);
      }
    }
  } catch (err) {
    console.error('[Abuse Detection] Error calculating score:', err);
  }

  let level: 'Normal' | 'Suspicious' | 'High Risk' = 'Normal';
  if (score >= 70) {
    level = 'High Risk';
  } else if (score >= 40) {
    level = 'Suspicious';
  }

  return { score, level, flags };
}

export async function logSecurityEvent(
  licenseId: string | null,
  deviceId: string | null,
  eventType: string,
  details: object,
  ipAddress?: string,
  country?: string
): Promise<void> {
  try {
    await supabase.from('security_events').insert({
      license_id: licenseId,
      device_id: deviceId,
      event_type: eventType,
      details,
      ip_address: ipAddress || 'Unknown',
      country: country || 'Unknown',
    });
  } catch (err) {
    console.error('[Abuse Detection] Failed to log security event:', err);
  }
}
