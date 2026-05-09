import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://sdtufxbdxgkieohxmeki.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkdHVmeGJkeGdraWVvaHhtZWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTQ4NjUsImV4cCI6MjA5MzY3MDg2NX0.LdPVhpntk307QkZOonhqzJJT0ixX6tTH9FqO1YOxd_k'
);
async function check() {
  // Only the columns that exist in the DB
  const res = await supabase
    .from('companies')
    .select('id, name, google_calendar_email')
    .eq('id', '3add4732-59a8-454c-a78a-a777936b897b')
    .maybeSingle();
  console.log('--- CONFIRMED ---');
  console.dir(res, {depth:null});
}
check();
