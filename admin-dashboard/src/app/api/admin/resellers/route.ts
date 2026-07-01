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
  const token = authHeader.replace(/^Bearer\\s+/i, '');
  const adminSecret = process.env.ADMIN_SECRET || 'fallback_secret';
  try {
    return require('jsonwebtoken').verify(token, adminSecret);
  } catch (err: any) {
    throw new AuthError(err.message || 'Unauthorized');
  }
}

// GET: list and search resellers
export async function GET(request: Request) {
  try {
    verifyAuth(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const supabase = getSupabaseAdmin();
    let db = supabase.from('resellers').select('*');
    if (query) {
      db = db.ilike('reseller_name', `%${query}%`).or(`company_name.ilike.%${query}%`);
    }
    const { data, error } = await db.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, resellers: data });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

// POST: create reseller
export async function POST(request: Request) {
  try {
    verifyAuth(request);
    const payload = await request.json();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('resellers').insert(payload).select('*').single();
    if (error) throw error;
    return NextResponse.json({ success: true, reseller: data });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

// PATCH: update reseller fields
export async function PATCH(request: Request) {
  try {
    verifyAuth(request);
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('resellers').update(updates).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ success: true, reseller: data });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

// DELETE: delete reseller (only if no linked licenses)
export async function DELETE(request: Request) {
  try {
    verifyAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: linked, error: linkErr } = await supabase.from('licenses').select('id').eq('reseller_id', id).limit(1);
    if (linkErr) throw linkErr;
    if (linked && linked.length > 0) {
      return NextResponse.json({ success: false, error: 'Reseller has linked licenses; cannot delete.' }, { status: 400 });
    }
    const { error } = await supabase.from('resellers').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    const status = err instanceof AuthError ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

