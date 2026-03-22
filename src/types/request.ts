import type { FormEntity } from './form';
import type { AuthorPreview } from './author';

export interface RequestEntity {
  id: string;
  title: string;
  form_id: string;
  data: Record<string, unknown>;
  status: 'open' | 'closed';
  closedAt: string | null;
  created_by_user_id: string | null;
  author: AuthorPreview | null;
  created_at: string;
  updated_at: string;
  form_snapshot?: FormEntity | null;
  ai_summary?: { summary: string; priority: string; tags: string[] } | null;
}

