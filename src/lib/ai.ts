import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { plain, tables } from './db';

export type Provider = 'OPENAI' | 'GEMINI' | 'GROK' | 'ANTHROPIC';
export async function aiConfig() {
  const row = plain<any>(await tables().amp_settings.findOne({ where: { key: 'ai' } }));
  try { return { provider: 'OPENAI' as Provider, model: 'gpt-5-nano', ...(row ? JSON.parse(row.value) : {}) }; }
  catch { return { provider: 'OPENAI' as Provider, model: 'gpt-5-nano' }; }
}
export async function generate(system: string, prompt: string): Promise<{ text: string; provider: string; model: string }> {
  const { provider, model } = await aiConfig();
  if (provider === 'OPENAI') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({ model: 'gpt-5-nano', instructions: system, input: prompt, max_output_tokens: 400 });
    return { text: response.output_text.trim(), provider, model: 'gpt-5-nano' };
  }
  if (provider === 'GEMINI') {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({ model, contents: prompt, config: { systemInstruction: system } });
    return { text: (response.text || '').trim(), provider, model };
  }
  if (provider === 'GROK') {
    if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY no configurada');
    const client = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
    const response = await client.chat.completions.create({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] });
    return { text: response.choices[0]?.message?.content?.trim() || '', provider, model };
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({ model, max_tokens: 400, system, messages: [{ role: 'user', content: prompt }] });
  return { text: response.content.filter(part => part.type === 'text').map(part => part.text).join('\n').trim(), provider, model };
}
