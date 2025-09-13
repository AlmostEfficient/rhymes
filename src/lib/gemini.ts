import { GoogleGenerativeAI } from '@google/generative-ai';
import type { BenchmarkData, StreamMetrics } from '../types/benchmark';
import { calculateMetrics } from '../types/benchmark';

export const MODEL_NAME = 'gemini-2.0-flash';

function validateApiKey(): string {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'VITE_GEMINI_API_KEY environment variable is not set. ' +
      'Please add your Gemini API key to the .env.local file.'
    );
  }
  
  if (apiKey === 'your_api_key_here') {
    throw new Error(
      'Please replace "your_api_key_here" in .env.local with your actual Gemini API key. ' +
      'Get your key from: https://aistudio.google.com/app/apikey'
    );
  }
  
  if (apiKey.length < 20) {
    throw new Error(
      'The provided API key appears to be invalid (too short). ' +
      'Please check your Gemini API key in .env.local'
    );
  }
  
  return apiKey;
}

const apiKey = validateApiKey();
const genAI = new GoogleGenerativeAI(apiKey);

export const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
});

export async function* streamChatWithMetrics(message: string): AsyncGenerator<{ chunk: string; metrics?: StreamMetrics }> {
  const benchmark: BenchmarkData = {
    requestId: Date.now().toString(),
    startTime: performance.now(),
    tokenCount: 0
  };

  try {
    const result = await model.generateContentStream(message);
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
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
    if (error.message?.includes('API key not valid')) {
      throw new Error(
        'Invalid Gemini API key. Please check your API key in .env.local. ' +
        'Get a new key from: https://aistudio.google.com/app/apikey'
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