import { Config } from '@/constants/config';
import { mockCoach, mockPlan } from './mock';
import {
  AiError,
  type CoachRequest,
  type CoachResponse,
  type PlanRequest,
  type PlanResponse,
} from './types';

function isMockMode(): boolean {
  return !Config.coachApiUrl;
}

async function post<T>(path: string, body: unknown, deviceId: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Config.aiTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${Config.coachApiUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-token': Config.coachAppToken,
        'x-device-id': deviceId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('timeout', 'timeout');
    throw new AiError('network error', 'offline');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new AiError('rate limited', 'rate_limited');
  if (!res.ok) throw new AiError(`server error ${res.status}`, 'server');
  return (await res.json()) as T;
}

/** 目標をAIで週次プラン+7日分の行動に分解する */
export async function generatePlan(req: PlanRequest, deviceId: string): Promise<PlanResponse> {
  if (isMockMode()) return mockPlan(req);
  return post<PlanResponse>('/v1/plan', req, deviceId);
}

/** コーチ対話(1往復) */
export async function chatWithCoach(req: CoachRequest, deviceId: string): Promise<CoachResponse> {
  if (isMockMode()) return mockCoach(req);
  return post<CoachResponse>('/v1/coach', req, deviceId);
}
