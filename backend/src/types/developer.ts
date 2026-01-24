export interface Developer {
  wallet_address: string;
  email: string;
  github_username: string | null;
  skills: string[];
  bio: string | null;
  hourly_rate: number | null;
  availability: 'available' | 'busy' | 'vacation';
  stake_amount: string;
  staked_at: Date | null;
  status: 'pending' | 'active' | 'suspended';
  created_at: Date;
  updated_at: Date;
}

export interface CreateDeveloperInput {
  address: string;
  message: string;
  signature: string;
  email: string;
  githubUsername?: string;
  skills: string[];
  bio?: string;
  hourlyRate?: number;
}

export interface UpdateDeveloperInput {
  address: string;
  message: string;
  signature: string;
  email?: string;
  skills?: string[];
  bio?: string;
  hourlyRate?: number;
  availability?: 'available' | 'busy' | 'vacation';
}
