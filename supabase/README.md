# Supabase Setup

## Apply migrations

1. Go to Supabase Dashboard → SQL Editor
2. Paste and run `migrations/001_initial_schema.sql`

## Configure Google OAuth

1. Supabase Dashboard → Authentication → Providers → Google
2. Enable Google, add Client ID and Secret from Google Cloud Console
3. Add redirect URL: `https://your-project.supabase.co/auth/v1/callback`
4. Also add for local dev: `http://localhost:3000/auth/callback`

## Storage bucket

1. Supabase Dashboard → Storage → New bucket
2. Name: `receipts`
3. Public: true (for receipt image URLs)

## Cron Jobs (after Edge Functions deployed)

Enable pg_cron extension in Database → Extensions, then run:

```sql
select cron.schedule(
  'bill-reminders-daily',
  '0 9 * * *',
  $$ select net.http_post(url := 'YOUR_FUNCTION_URL/bill-reminders', headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb); $$
);

select cron.schedule(
  'monthly-report',
  '0 8 1 * *',
  $$ select net.http_post(url := 'YOUR_FUNCTION_URL/monthly-report', headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb); $$
);
```
