
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

const genAI = new GoogleGenerativeAI(env.GOOGLE_AI_API_KEY);

async function listModels() {
  try {
    console.log('--- Listando modelos disponíveis para sua chave ---');
    // Nota: O SDK v0.21+ não tem listModels direto de forma simples as vezes, 
    // mas vamos tentar usar o endpoint de fetch se falhar
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GOOGLE_AI_API_KEY}`);
    const data = await response.json();
    
    if (data.error) {
      console.error('Erro na API:', data.error);
      return;
    }

    console.log('Modelos encontrados:');
    data.models.forEach(m => {
      if (m.name.includes('flash') || m.name.includes('pro')) {
        console.log(`- ${m.name} (${m.displayName})`);
      }
    });
  } catch (err) {
    console.error('Erro ao listar:', err.message);
  }
}

listModels();
