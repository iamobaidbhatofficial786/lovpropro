// src/app/api/admin/[...slug]/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase';

class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function verifyAuth(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const adminSecret = process.env.ADMIN_SECRET || 'fallback_secret';
  try {
    return require('jsonwebtoken').verify(token, adminSecret);
  } catch (err: any) {
    throw new AuthError(err.message || 'Unauthorized');
  }
}

export async function GET(request: Request) {
  try {
    verifyAuth(request);
    const { pathname } = new URL(request.url);
    const parts = pathname.split('/').filter(Boolean); // ['', 'api', 'admin', ...slug]
    const slug = parts.slice(3); // after 'admin'
    const supabase = getSupabaseAdmin();

    // /api/admin/resellers
    if (slug[0] === 'resellers') {
      const query = new URL(request.url).searchParams.get('query') || '';
      let db = supabase.from('resellers').select('*');
      if (query) {
        db = db.ilike('reseller_name', `%${query}%`).or(`company_name.ilike.%${query}%`);
      }
      const { data, error } = await db.order('created_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json({ success: true, resellers: data });
    }

    // /api/admin/devices
    if (slug[0] === 'devices') {
      const { data, error } = await supabase.from('devices').select('*');
      if (error) throw error;
      return NextResponse.json({ success: true, devices: data });
    }

    // /api/admin/licenses
    if (slug[0] === 'licenses') {
      const { data, error } = await supabase.from('licenses').select('*');
      if (error) throw error;
      return NextResponse.json({ success: true, licenses: data });
    }

    // /api/admin/logs
    if (slug[0] === 'logs') {
      const { data, error } = await supabase.from('logs').select('*');
      if (error) throw error;
      return NextResponse.json({ success: true, logs: data });
    }

    // /api/admin/stats
    if (slug[0] === 'stats') {
      const { data, error } = await supabase.from('stats').select('*');
      if (error) throw error;
      return NextResponse.json({ success: true, stats: data });
    }

    return NextResponse.json({ success: false, error: 'Unknown admin endpoint' }, { status: 404 });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    verifyAuth(request);
    const { pathname } = new URL(request.url);
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts.slice(3);
    const supabase = getSupabaseAdmin();
    const payload = await request.json();

    if (slug[0] === 'resellers') {
      const { data, error } = await supabase.from('resellers').insert(payload).select('*').single();
      if (error) throw error;
      return NextResponse.json({ success: true, reseller: data });
    }

    if (slug[0] === 'devices') {
      const { data, error } = await supabase.from('devices').insert(payload).select('*').single();
      if (error) throw error;
      return NextResponse.json({ success: true, device: data });
    }

    if (slug[0] === 'licenses') {
      const { data, error } = await supabase.from('licenses').insert(payload).select('*').single();
      if (error) throw error;
      return NextResponse.json({ success: true, license: data });
    }

    return NextResponse.json({ success: false, error: 'Unsupported POST endpoint' }, { status: 400 });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    verifyAuth(request);
    const { pathname } = new URL(request.url);
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts.slice(3);
    const supabase = getSupabaseAdmin();
    const payload = await request.json();
    const { id, ...updates } = payload;
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

    if (slug[0] === 'resellers') {
      const { data, error } = await supabase.from('resellers').update(updates).eq('id', id).select('*').single();
      if (error) throw error;
      return NextResponse.json({ success: true, reseller: data });
    }

    if (slug[0] === 'devices') {
      const { data, error } = await supabase.from('devices').update(updates).eq('id', id).select('*').single();
      if (error) throw error;
      return NextResponse.json({ success: true, device: data });
    }

    if (slug[0] === 'licenses') {
      const { data, error } = await supabase.from('licenses').update(updates).eq('id', id).select('*').single();
      if (error) throw error;
      return NextResponse.json({ success: true, license: data });
    }

    return NextResponse.json({ success: false, error: 'Unsupported PATCH endpoint' }, { status: 400 });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    verifyAuth(request);
    const { pathname, searchParams } = new URL(request.url);
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts.slice(3);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const supabase = getSupabaseAdmin();

    if (slug[0] === 'resellers') {
      const { data: linked, error: linkErr } = await supabase.from('licenses').select('id').eq('reseller_id', id).limit(1);
      if (linkErr) throw linkErr;
      if (linked && linked.length > 0) {
        return NextResponse.json({ success: false, error: 'Reseller has linked licenses; cannot delete.' }, { status: 400 });
      }
      const { error } = await supabase.from('resellers').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (slug[0] === 'devices') {
      const { error } = await supabase.from('devices').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (slug[0] === 'licenses') {
      const { error } = await supabase.from('licenses').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unsupported DELETE endpoint' }, { status: 400 });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
