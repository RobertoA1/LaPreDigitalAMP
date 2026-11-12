import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { plain, tables } from './db';

export type Provider = 'OPENAI' | 'GEMINI' | 'GROK' | 'ANTHROPIC';
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
export async function aiConfig() {
  const row = plain<any>(await tables().amp_settings.findOne({ where: { key: 'ai' } }));
  try { return { provider: 'OPENAI' as Provider, model: DEFAULT_OPENAI_MODEL, ...(row ? JSON.parse(row.value) : {}) }; }
  catch { return { provider: 'OPENAI' as Provider, model: DEFAULT_OPENAI_MODEL }; }
}
export type GenerateOptions = {
  /** Máximo de tokens de salida. Por defecto 400 (comportamiento histórico). En OpenAI incluye el razonamiento. */
  maxOutputTokens?: number;
  /** Pide salida JSON con el modo de formato del proveedor (el llamador debe validar el resultado). */
  json?: boolean;
};
export async function generate(system: string, prompt: string, options: GenerateOptions = {}): Promise<{ text: string; provider: string; model: string }> {
  const { provider, model } = await aiConfig();
  const maxTokens = options.maxOutputTokens ?? 400;
  // Modelos de razonamiento (gpt-5*, o*): el razonamiento consume tokens de salida, por eso solo se usa esfuerzo bajo y tope holgado cuando se pide JSON/salida larga.
  if (provider === 'OPENAI') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, ...(options.maxOutputTokens ? { timeout: 270_000, maxRetries: 0 } : {}) }); // las ejecuciones largas deben acabar antes de que venza el arrendamiento del trabajo (5 min)
    const razona = /^(gpt-5|o\d)/i.test(model);
    const response = await client.responses.create({
      model, instructions: system, input: prompt, max_output_tokens: maxTokens,
      ...(razona ? { reasoning: { effort: 'low' as const } } : {}),
      ...(options.json ? { text: { format: { type: 'json_object' as const } } } : {})
    });
    if (response.status === 'incomplete' && (options.json || !response.output_text.trim())) throw new Error(`Respuesta incompleta de OpenAI (${response.incomplete_details?.reason || 'desconocido'}): sube el máximo de tokens de salida`);
    if (response.error) throw new Error(`OpenAI: ${response.error.message}`);
    return { text: response.output_text.trim(), provider, model };
  }
  if (provider === 'GEMINI') {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({ model, contents: prompt, config: { systemInstruction: system, ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}), ...(options.json ? { responseMimeType: 'application/json' } : {}) } });
    return { text: (response.text || '').trim(), provider, model };
  }
  if (provider === 'GROK') {
    if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY no configurada');
    const client = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
    const response = await client.chat.completions.create({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], ...(options.maxOutputTokens ? { max_completion_tokens: options.maxOutputTokens } : {}), ...(options.json ? { response_format: { type: 'json_object' as const } } : {}) });
    return { text: response.choices[0]?.message?.content?.trim() || '', provider, model };
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Anthropic no tiene modo JSON: el prompt del llamador exige JSON y se valida después.
  const response = await client.messages.create({ model, max_tokens: options.maxOutputTokens ?? 400, system, messages: [{ role: 'user', content: prompt }] });
  return { text: response.content.filter(part => part.type === 'text').map(part => part.text).join('\n').trim(), provider, model };
}
