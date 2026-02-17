export interface Client {
  wallet_address: string;
  email: string | null;
  company_name: string | null;
  description: string | null;
  website: string | null;
  is_registered: boolean;
  projects_created: number;
  projects_completed: number;
  total_spent: string;
  reputation_score: number | null;
  average_rating: number | null;
  total_reviews: number;
  rating_distribution: Record<string, number>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateClientInput {
  address: string;
  message: string;
  signature: string;
  email: string;
  companyName: string;
  description?: string;
  website?: string;
}

export interface UpdateClientInput {
  address: string;
  message: string;
  signature: string;
  email?: string;
  companyName?: string;
  description?: string;
  website?: string;
}
