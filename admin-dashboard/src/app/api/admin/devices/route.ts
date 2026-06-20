import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

function verifyAuth(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const adminSecret = process.env.ADMIN_SECRET || 'fallback_secret';
  return jwt.verify(token, adminSecret);
}

// GET: list all bound devices
export async function GET(request: Request) {
  try {
    verifyAuth(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';

    const supabase = getSupabaseAdmin();
    let dbQuery = supabase.from('devices').select('*, licenses(plan_name)');

    if (query) {
      dbQuery = dbQuery.or(`device_hash.ilike.%${query}%,ip_address.ilike.%${query}%,country.ilike.%${query}%`);
    }

    const { data: devices, error } = await dbQuery.order('last_seen', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, devices });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 401 });
  }
}

// DELETE: unbind / remove a device
export async function DELETE(request: Request) {
  try {
    verifyAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Device id is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Get device license_id first
    const { data: device, error: fetchErr } = await supabase
      .from('devices')
      .select('license_id')
      .eq('id', id)
      .single();

    if (fetchErr || !device) {
      return NextResponse.json({ success: false, error: 'Device not found.' }, { status: 404 });
    }

    const licenseId = device.license_id;

    // 2. Delete device
    const { error: delErr } = await supabase.from('devices').delete().eq('id', id);
    if (delErr) throw delErr;

    // 3. Decrement activation count
    const { data: license } = await supabase
      .from('licenses')
      .select('activation_count')
      .eq('id', licenseId)
      .single();

    if (license) {
      const newCount = Math.max(0, license.activation_count - 1);
      await supabase.from('licenses').update({ activation_count: newCount }).eq('id', licenseId);
    }

    return NextResponse.json({ success: true, message: 'Device removed and license unbinded.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
