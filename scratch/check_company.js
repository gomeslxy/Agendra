const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Manual env loading
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) process.env[key.trim()] = value.trim().replace(/"/g, '');
});


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCompany() {
  const companyId = '3add4732-59a8-454c-a78a-a777936b897b';
  console.log(`Checking company: ${companyId}`);

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    console.error('Error:', error);
  } else if (!data) {
    console.log('Company NOT FOUND in companies table!');
    
    // Let's see what companies DO exist
    const { data: all } = await supabase.from('companies').select('id, name').limit(5);
    console.log('Sample of existing companies:', all);
  } else {
    console.log('Company found:', data);
  }
}

checkCompany();
