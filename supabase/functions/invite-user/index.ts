// Sends the Supabase invitation email for a pending invitation.
// The invitation row (role + offices) is created first by the caller through create_invitation(),
// which checks the caller's permission. This function only emails people with a pending invitation
// created by the caller (or by anyone, if the caller is a Super Admin), so it cannot be used to
// email arbitrary addresses. The service-role key never leaves the server.
//
// Deploy: supabase functions deploy invite-user
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Sign in first' });

  let body: { email?: string; redirectTo?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON body' }); }
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Invalid email' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: me, error: meErr } = await caller.auth.getUser();
  if (meErr || !me.user) return json(401, { error: 'Session expired; sign in again' });

  const { data: isSuper } = await caller.rpc('is_super_admin');
  let q = admin.from('user_invitations').select('id, invited_by').eq('email', email).eq('status', 'pending').limit(1);
  if (!isSuper) q = q.eq('invited_by', me.user.id);
  const { data: inv, error: invErr } = await q.maybeSingle();
  if (invErr) return json(500, { error: invErr.message });
  if (!inv) return json(403, { error: 'No pending invitation from you for this email' });

  // Only allow redirects back to the same site the request came from
  const origin = req.headers.get('origin');
  const redirectTo = body.redirectTo && origin && body.redirectTo.startsWith(origin) ? body.redirectTo : undefined;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) return json(400, { error: error.message });
  return json(200, { ok: true });
});
