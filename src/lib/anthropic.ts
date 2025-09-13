import Anthropic from '@anthropic-ai/sdk';
import type { BenchmarkData, StreamMetrics } from '../types/benchmark';
import { calculateMetrics } from '../types/benchmark';

export const MODEL_NAME = 'claude-3-haiku-20240307';

function validateApiKey(): string {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'VITE_ANTHROPIC_API_KEY environment variable is not set. ' +
      'Please add your Anthropic API key to the .env.local file.'
    );
  }
  
  if (apiKey === 'your_api_key_here') {
    throw new Error(
      'Please replace "your_api_key_here" in .env.local with your actual Anthropic API key. ' +
      'Get your key from: https://console.anthropic.com/'
    );
  }
  
  if (!apiKey.startsWith('sk-ant-')) {
    throw new Error(
      'The provided API key appears to be invalid. Anthropic API keys should start with "sk-ant-". ' +
      'Please check your Anthropic API key in .env.local'
    );
  }
  
  return apiKey;
}

const apiKey = validateApiKey();
const client = new Anthropic({
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
    const stream = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      messages: [{ role: 'user', content: message }],
      stream: true,
    });
    
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const chunkText = chunk.delta.text;
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
    }
    
    // Mark end time and yield final metrics
    benchmark.endTime = performance.now();
    const metrics = calculateMetrics(benchmark);
    yield { chunk: '', metrics };
    
  } catch (error: any) {
    if (error.status === 401) {
      throw new Error(
        'Invalid Anthropic API key. Please check your API key in .env.local. ' +
        'Get a new key from: https://console.anthropic.com/'
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