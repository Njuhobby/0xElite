export interface Dispute {
  id: string;
  dispute_number: number;
  project_id: string;
  client_address: string;
  developer_address: string;
  initiator_address: string;
  initiator_role: 'client' | 'developer';
  status: 'open' | 'voting' | 'resolved';
  client_evidence_uri: string | null;
  developer_evidence_uri: string | null;
  evidence_deadline: Date;
  voting_deadline: Date | null;
  voting_snapshot: Date | null;
  client_vote_weight: string;
  developer_vote_weight: string;
  total_vote_weight: string;
  quorum_required: string | null;
  winner: 'client' | 'developer' | null;
  resolved_by_owner: boolean;
  client_share: string | null;
  developer_share: string | null;
  arbitration_fee: string;
  chain_dispute_id: number | null;
  creation_tx_hash: string | null;
  resolution_tx_hash: string | null;
  created_at: Date;
  resolved_at: Date | null;
  updated_at: Date;
}

export interface DisputeVote {
  id: string;
  dispute_id: string;
  voter_address: string;
  support_client: boolean;
  vote_weight: string;
  reward_amount: string | null;
  tx_hash: string | null;
  voted_at: Date;
}

export interface CreateDisputeInput {
  address: string;
  message: string;
  signature: string;
  projectId: string;
  evidenceUri: string;
}

export interface SubmitEvidenceInput {
  address: string;
  message: string;
  signature: string;
  evidenceUri: string;
}

export interface CastVoteInput {
  address: string;
  message: string;
  signature: string;
  supportClient: boolean;
}

export interface OwnerResolveInput {
  address: string;
  message: string;
  signature: string;
  clientWon: boolean;
}
