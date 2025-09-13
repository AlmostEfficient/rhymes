import OpenAI from 'openai';
import type { BenchmarkData, StreamMetrics } from '../types/benchmark';
import { calculateMetrics } from '../types/benchmark';

export const MODEL_NAME = 'gpt-4.1-nano';

function validateApiKey(): string {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'VITE_OPENAI_API_KEY environment variable is not set. ' +
      'Please add your OpenAI API key to the .env.local file.'
    );
  }
  
  if (apiKey === 'your_api_key_here') {
    throw new Error(
      'Please replace "your_api_key_here" in .env.local with your actual OpenAI API key. ' +
      'Get your key from: https://platform.openai.com/api-keys'
    );
  }
  
  if (!apiKey.startsWith('sk-')) {
    throw new Error(
      'The provided API key appears to be invalid. OpenAI API keys should start with "sk-". ' +
      'Please check your OpenAI API key in .env.local'
    );
  }
  
  return apiKey;
}

const apiKey = validateApiKey();
const client = new OpenAI({
  apiKey,
  dangerouslyAllowBrowser: true
});

export async function* streamChatWithMetrics(message: string): AsyncGenerator<{ chunk: string; metrics?: StreamMetrics }> {
  const benchmark: BenchmarkData = {
    requestId: Date.now().toString(),
    startTime: performance.now(),
    tokenCount: 0
  };

  try {
    const stream = await client.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [{ role: 'user', content: message }],
      stream: true,
    });
    
    for await (const chunk of stream) {
      const chunkText = chunk.choices[0]?.delta?.content || '';
      if (chunkText) {
        // Mark first token time
        if (!benchmark.firstTokenTime) {
          benchmark.firstTokenTime = performance.now();
        }
        
        // Rough token estimation (approximate)
        benchmark.tokenCount += chunkText.split(/\s+/).length;
        
        yield { chunk: chunkText };
      }
    }
    
    // Mark end time and yield final metrics
    benchmark.endTime = performance.now();
    const metrics = calculateMetrics(benchmark);
    yield { chunk: '', metrics };
    
  } catch (error: any) {
    if (error.status === 401) {
      throw new Error(
        'Invalid OpenAI API key. Please check your API key in .env.local. ' +
        'Get a new key from: https://platform.openai.com/api-keys'
      );
    }
    throw error;
  }
}

// Keep the original function for backward compatibility
export async function* streamChat(message: string) {
  for await (const { chunk } of streamChatWithMetrics(message)) {
    if (chunk) {
      yield chunk;
    }
  }
}