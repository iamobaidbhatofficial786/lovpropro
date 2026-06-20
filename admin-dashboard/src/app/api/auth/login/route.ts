import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Query admin user from DB
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
    }

    // Verify bcrypt password hash
    const passwordIsValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordIsValid) {
      return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
    }

    const adminSecret = process.env.ADMIN_SECRET || 'fallback_secret';
    
    // Generate admin session JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      adminSecret,
      { expiresIn: '12h' }
    );

    return NextResponse.json({ success: true, token });
  } catch (err: any) {
    console.error('[Admin Login Route Error]:', err);
    return NextResponse.json({ success: false, error: 'Internal server error: ' + err.message }, { status: 500 });
  }
}
