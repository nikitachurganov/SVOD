export interface RequestTZSections {
  title: string;
  short_description: string;
  goal: string;
  tasks: string[];
  expected_result: string;
  inputs: string[];
  constraints: string[];
  deadline: string | null;
  acceptance_criteria: string[];
  clarifications_and_risks: string[];
  missing_or_unclear: string[];
}

export interface RequestTechnicalSpecEnvelope {
  status: 'draft' | 'confirmed';
  generated_at: string;
  confirmed_at: string | null;
  sections: RequestTZSections;
}

export interface PatchRequestTZPayload {
  sections?: Partial<RequestTZSections>;
  status?: 'draft' | 'confirmed';
}
