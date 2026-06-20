import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { generateLicenseKey, sha256 } from '@/lib/crypto';
import jwt from 'jsonwebtoken';

function verifyAuth(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const adminSecret = process.env.ADMIN_SECRET || 'fallback_secret';
  return jwt.verify(token, adminSecret);
}

// GET: list & search licenses
export async function GET(request: Request) {
  try {
    verifyAuth(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';

    const supabase = getSupabaseAdmin();
    let dbQuery = supabase.from('licenses').select('*');

    if (query) {
      // If query looks like a key, search by its hash
      if (/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(query.trim())) {
        const hashedQuery = sha256(query.trim());
        dbQuery = dbQuery.eq('license_key_hash', hashedQuery);
      } else {
        // Search in plan_name or notes
        dbQuery = dbQuery.or(`plan_name.ilike.%${query}%,notes.ilike.%${query}%`);
      }
    }

    const { data: licenses, error } = await dbQuery.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, licenses });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 401 });
  }
}

// POST: create a new license
export async function POST(request: Request) {
  try {
    verifyAuth(request);
    const { plan_name, max_devices, expires_at, notes } = await request.json();

    if (!plan_name) {
      return NextResponse.json({ success: false, error: 'plan_name is required.' }, { status: 400 });
    }

    // 1. Generate secure key
    const rawKey = generateLicenseKey();
    const hash = sha256(rawKey);

    const supabase = getSupabaseAdmin();

    // 2. Insert into DB
    const { data: license, error } = await supabase
      .from('licenses')
      .insert({
        license_key_hash: hash,
        plan_name,
        max_devices: max_devices || 1,
        expires_at: expires_at || null,
        notes: notes || '',
        status: 'active',
        active: true,
      })
      .select('*')
      .single();

    if (error) throw error;

    // Return the raw key to show the user ONCE
    return NextResponse.json({ success: true, license, rawKey });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH: update / suspend / revoke / extend license
export async function PATCH(request: Request) {
  try {
    verifyAuth(request);
    const { id, plan_name, max_devices, expires_at, notes, status } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'License id is required.' }, { status: 400 });
    }

    const updates: any = {};
    if (plan_name !== undefined) updates.plan_name = plan_name;
    if (max_devices !== undefined) updates.max_devices = max_devices;
    if (expires_at !== undefined) updates.expires_at = expires_at || null;
    if (notes !== undefined) updates.notes = notes;
    
    if (status !== undefined) {
      updates.status = status;
      updates.active = status === 'active';
      updates.suspended = status === 'suspended';
      updates.revoked = status === 'revoked';
      updates.expired = status === 'expired';
    }

    const supabase = getSupabaseAdmin();
    const { data: license, error } = await supabase
      .from('licenses')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, license });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: delete a license
export async function DELETE(request: Request) {
  try {
    verifyAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'License id is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('licenses').delete().eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
