import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env loader
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
    .map(([key, ...val]) => [key.trim(), val.join('=').trim()])
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function setup() {
  console.log("--- Listing Companies ---");
  const { data: companies, error: compError } = await supabase.from('companies').select('*');
  if (compError) {
    console.error("Error fetching companies:", compError);
    return;
  }
  console.table(companies);

  if (companies.length === 0) {
    console.log("No companies found.");
    return;
  }

  const targetCompany = companies[0]; // Assuming the first one for now
  const phoneId = env.WHATSAPP_PHONE_ID;

  console.log(`--- Checking/Inserting Channel for ${targetCompany.name} ---`);
  
  const { data: existing, error: checkError } = await supabase
    .from('channels')
    .select('*')
    .eq('provider_id', phoneId)
    .maybeSingle();

  if (checkError) {
    console.error("Error checking channels:", checkError);
    return;
  }

  if (existing) {
    console.log("Channel already exists:", existing.id);
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('channels')
    .insert([
      {
        company_id: targetCompany.id,
        provider: 'whatsapp',
        provider_id: phoneId,
        access_token: env.WHATSAPP_TOKEN,
        status: 'active',
        meta: {
          waba_id: env.WHATSAPP_BUSINESS_ACCOUNT_ID
        }
      }
    ])
    .select();

  if (insertError) {
    console.error("Error inserting channel:", insertError);
  } else {
    console.log("Channel inserted successfully:", inserted[0].id);
  }
}

setup();
