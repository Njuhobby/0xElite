export interface Review {
  id: string;
  project_id: string;
  reviewer_address: string;
  reviewee_address: string;
  reviewer_type: 'client' | 'developer';
  rating: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateReviewInput {
  address: string;
  message: string;
  signature: string;
  projectId: string;
  rating: number;
  comment?: string;
}

export interface UpdateReviewInput {
  address: string;
  message: string;
  signature: string;
  rating?: number;
  comment?: string | null;
}
