export type RecommendationStatus = 'strong_match' | 'partial_match' | 'no_match';

export interface RecommendationFallback {
  required_role: string;
  recommended_sources: string[];
  geography: string;
}

export interface RecommendedPerformerDTO {
  id: string;
  full_name: string;
  position: string;
  organization: string | null;
  is_internal: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  active_tasks: number;
  contact_available: boolean;
}

export interface PerformerRecommendationResponse {
  status: RecommendationStatus;
  confidence: number;
  recommended_performer_id: string | null;
  performers: RecommendedPerformerDTO[];
  fallback: RecommendationFallback;
}

export interface AssignPerformerPayload {
  performer_id: string;
  send_tz: boolean;
  contact_method: string;
  recommended_performer_id?: string | null;
}
