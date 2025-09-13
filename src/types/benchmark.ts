export interface StreamMetrics {
  ttft: number; // Time to first token in milliseconds
  totalTime: number; // Total response time in milliseconds
  tokenCount: number; // Approximate token count
  tokensPerSecond: number; // Tokens per second throughput
}

export interface BenchmarkData {
  requestId: string;
  startTime: number;
  firstTokenTime?: number;
  endTime?: number;
  tokenCount: number;
}

export function calculateMetrics(benchmark: BenchmarkData): StreamMetrics {
  const ttft = benchmark.firstTokenTime ? benchmark.firstTokenTime - benchmark.startTime : 0;
  const totalTime = benchmark.endTime ? benchmark.endTime - benchmark.startTime : 0;
  const tokensPerSecond = totalTime > 0 ? (benchmark.tokenCount / totalTime) * 1000 : 0;
  
  return {
    ttft,
    totalTime,
    tokenCount: benchmark.tokenCount,
    tokensPerSecond
  };
}

export function formatMetrics(metrics: StreamMetrics): string {
  return `TTFT: ${Math.round(metrics.ttft)}ms | Total: ${Math.round(metrics.totalTime)}ms | ${metrics.tokenCount} tokens | ${metrics.tokensPerSecond.toFixed(1)} tok/s`;
}