
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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const defaultCompanyId = env.WHATSAPP_DEFAULT_COMPANY_ID;

if (!url || !key || !defaultCompanyId) {
  console.error('Faltam variáveis de ambiente no .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function activateChannel() {
  const phoneId = '1065222460013561'; // O ID CORRETO que você mandou agora
  
  console.log(`Ativando canal WhatsApp: ${phoneId} para a empresa ${defaultCompanyId}...`);

  const { data, error } = await supabase
    .from('channels')
    .upsert({
      company_id: defaultCompanyId,
      provider: 'whatsapp',
      provider_id: phoneId,
      status: 'active',
      meta: {
        waba_id: '973242505400486',
        phone_number: '+5519993097891'
      }
    }, { onConflict: 'provider,provider_id' })
    .select();

  if (error) {
    console.error('Erro ao ativar canal:', error);
  } else {
    console.log('✅ Canal ativado com sucesso!', JSON.stringify(data, null, 2));
  }
}

activateChannel();
