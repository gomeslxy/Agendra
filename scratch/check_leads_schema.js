const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value.length) {
    env[key.trim()] = value.join('=').trim();
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLeads() {
  const { data, error } = await supabase.from('leads').select('*').limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log('Colunas Leads:', Object.keys(data[0] || {}));
  }
}

checkLeads();
