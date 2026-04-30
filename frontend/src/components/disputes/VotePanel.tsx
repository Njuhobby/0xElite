'use client';

import { useEffect } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import {
  DISPUTE_DAO_ABI,
  ELITE_TOKEN_ABI,
  TX_CONFIRMATIONS,
  getDisputeDAOAddress,
  getEliteTokenAddress,
} from '@/config/contracts';
import { writePendingTx, deletePendingTx } from '@/lib/pendingTx';

interface VotePanelProps {
  disputeId: string;
  chainDisputeId: number | null;
  clientAddress: string;
  developerAddress: string;
  votingDeadline: string | null;
  votingSnapshot: string | null;
  onVoteConfirmed: () => void;
}

export default function VotePanel({
  disputeId,
  chainDisputeId,
  clientAddress,
  developerAddress,
  votingDeadline,
  votingSnapshot,
  onVoteConfirmed,
}: VotePanelProps) {
  const { address } = useAccount();

  const isParty =
    !!address &&
    (address.toLowerCase() === clientAddress.toLowerCase() ||
      address.toLowerCase() === developerAddress.toLowerCase());

  const deadlinePassed =
    !!votingDeadline && new Date(votingDeadline).getTime() <= Date.now();

  const canCheck =
    !!address && chainDisputeId != null && !isParty && !deadlinePassed;

  const { data: hasVoted } = useReadContract({
    address: getDisputeDAOAddress(),
    abi: DISPUTE_DAO_ABI,
    functionName: 'hasVoted',
    args: address && chainDisputeId != null
      ? [BigInt(chainDisputeId), address]
      : undefined,
    query: { enabled: canCheck },
  });

  // Voting power at the snapshot is the source of truth — current balance
  // can drift if the backend mints/burns xELITE between snapshot and now.
  const snapshotUnix =
    votingSnapshot != null
      ? BigInt(Math.floor(new Date(votingSnapshot).getTime() / 1000))
      : undefined;

  const { data: snapshotVotes } = useReadContract({
    address: getEliteTokenAddress(),
    abi: ELITE_TOKEN_ABI,
    functionName: 'getPastVotes',
    args: address && snapshotUnix != null ? [address, snapshotUnix] : undefined,
    query: { enabled: canCheck && snapshotUnix != null },
  });

  const {
    data: voteTxHash,
    writeContract,
    isPending: isVotingTx,
    error: writeError,
    variables,
  } = useWriteContract();

  const { isLoading: isWaitingReceipt, isSuccess: isVoteConfirmed } =
    useWaitForTransactionReceipt({
      hash: voteTxHash,
      confirmations: TX_CONFIRMATIONS,
    });

  // Best-effort early write so the poller can pick up the tx
  useEffect(() => {
    if (!voteTxHash || !address) return;
    const supportClient = (variables?.args?.[1] as boolean | undefined) ?? false;
    writePendingTx({
      entityType: 'dispute',
      entityId: disputeId,
      action: 'cast_vote',
      txHash: voteTxHash,
      walletAddress: address,
      metadata: { supportClient },
    }).catch(() => {});
  }, [voteTxHash, address, disputeId, variables]);

  useEffect(() => {
    if (!voteTxHash || !isVoteConfirmed || !address) return;
    (async () => {
      const supportClient = (variables?.args?.[1] as boolean | undefined) ?? false;
      await writePendingTx({
        entityType: 'dispute',
        entityId: disputeId,
        action: 'cast_vote',
        txHash: voteTxHash,
        walletAddress: address,
        metadata: { supportClient },
      }).catch(() => {});
      await deletePendingTx(voteTxHash);
      onVoteConfirmed();
    })();
  }, [voteTxHash, isVoteConfirmed, address, disputeId, variables, onVoteConfirmed]);

  const submitting = isVotingTx || isWaitingReceipt;

  // Hide once user has voted (frontend mirror; contract still enforces uniqueness)
  if (hasVoted === true) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500">You have already voted on this dispute.</p>
      </div>
    );
  }

  if (!address) return null;
  if (chainDisputeId == null) return null;

  const weightRaw = (snapshotVotes as bigint | undefined) ?? BigInt(0);
  const noWeight = snapshotVotes != null && weightRaw === BigInt(0);
  const weightDisplay = (Number(weightRaw) / 1e6).toFixed(2);

  let disabledReason: string | null = null;
  if (isParty) disabledReason = 'Parties to this dispute cannot vote';
  else if (deadlinePassed) disabledReason = 'Voting period has ended';
  else if (noWeight) disabledReason = 'You had no EliteToken voting power at the snapshot';

  const handleVote = (supportClient: boolean) => {
    if (disabledReason) return;
    writeContract({
      address: getDisputeDAOAddress(),
      abi: DISPUTE_DAO_ABI,
      functionName: 'castVote',
      args: [BigInt(chainDisputeId), supportClient],
    });
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Cast Your Vote</h3>
      {!isParty && snapshotVotes != null && (
        <p className="text-xs text-gray-500 mb-2">
          Your voting power: <span className="font-semibold text-gray-800">{weightDisplay} xELITE</span>
          <span className="ml-2 text-gray-400">(snapshot)</span>
        </p>
      )}
      {disabledReason && (
        <p className="text-xs text-gray-500 mb-3">{disabledReason}</p>
      )}
      {writeError && (
        <p className="text-xs text-red-600 mb-3">{writeError.message}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleVote(true)}
          disabled={!!disabledReason || submitting}
          className="px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-semibold transition-colors"
        >
          Support Client
        </button>
        <button
          type="button"
          onClick={() => handleVote(false)}
          disabled={!!disabledReason || submitting}
          className="px-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-semibold transition-colors"
        >
          Support Developer
        </button>
      </div>
      {submitting && (
        <p className="text-xs text-gray-500 mt-2">
          {isVotingTx ? 'Confirm in wallet...' : 'Waiting for confirmation...'}
        </p>
      )}
    </div>
  );
}
