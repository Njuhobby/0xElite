'use client';

import { useState, useEffect } from 'react';
import { useWriteContract, useReadContract, useWaitForTransactionReceipt, useSignMessage } from 'wagmi';
import { Address } from 'viem';
import { targetChain } from '@/config/wagmi';

// Extract a user-friendly error message from wallet/viem errors
function getShortErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message;
  if (msg.includes('User rejected') || msg.includes('User denied')) return 'Transaction was rejected by user';
  if (msg.includes('insufficient funds')) return 'Insufficient funds for transaction';
  if (msg.includes('insufficient allowance')) return 'Insufficient USDC allowance';
  // Return first sentence only
  const firstLine = msg.split('\n')[0];
  return firstLine.length > 120 ? firstLine.slice(0, 120) + '...' : firstLine;
}

// Contract ABIs
const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const STAKE_VAULT_ABI = [
  {
    name: 'stake',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'requiredStake',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Contract addresses from environment
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d') as Address;
const STAKE_VAULT_ADDRESS = (process.env.NEXT_PUBLIC_STAKE_VAULT_ADDRESS || '0x...') as Address;

// Fallback stake amount (raw USDC base units, e.g. 200000000 = 200 USDC)
const FALLBACK_STAKE_AMOUNT = BigInt('200000000');

interface FormData {
  email: string;
  githubUsername?: string;
  skills: string[];
  bio?: string;
  hourlyRate?: string;
}

interface Props {
  address: string;
  formData: FormData;
  onBack: () => void;
  onSuccess: () => void;
}

export default function StakeFlow({ address, formData, onBack, onSuccess }: Props) {
  const [step, setStep] = useState<'approve' | 'stake'>('approve');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string>('');

  // Check if contract addresses are configured
  const isConfigured = STAKE_VAULT_ADDRESS !== '0x...' && !STAKE_VAULT_ADDRESS.includes('...');

  // Read required stake amount from contract
  const { data: requiredStake } = useReadContract({
    address: STAKE_VAULT_ADDRESS,
    abi: STAKE_VAULT_ABI,
    functionName: 'requiredStake',
  });

  const stakeAmount = requiredStake || FALLBACK_STAKE_AMOUNT;

  // Check USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [address as Address, STAKE_VAULT_ADDRESS],
  });

  // USDC approve
  const {
    data: approveHash,
    writeContract: approveUSDC,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract();

  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Stake
  const {
    data: stakeHash,
    writeContract: stakeTokens,
    isPending: isStakePending,
    error: stakeError,
  } = useWriteContract();

  const { isLoading: isStaking, isSuccess: isStakeSuccess } = useWaitForTransactionReceipt({
    hash: stakeHash,
  });

  // Sign message for backend
  const { signMessageAsync } = useSignMessage();

  // On mount: if allowance is already sufficient, skip to stake
  useEffect(() => {
    if (step === 'approve' && allowance != null && BigInt(allowance.toString()) >= BigInt(stakeAmount)) {
      setStep('stake');
    }
  }, [step, allowance, stakeAmount]);

  // After approve tx confirmed, refetch allowance to verify
  useEffect(() => {
    if (isApproveSuccess && step === 'approve' && !isVerifying) {
      setIsVerifying(true);
      refetchAllowance().then(({ data }) => {
        if (data != null && BigInt(data.toString()) >= BigInt(stakeAmount)) {
          setStep('stake');
        }
        setIsVerifying(false);
      });
    }
  }, [isApproveSuccess, step, refetchAllowance, stakeAmount, isVerifying]);

  const handleRetryVerify = () => {
    setIsVerifying(true);
    refetchAllowance().then(({ data }) => {
      if (data != null && BigInt(data.toString()) >= BigInt(stakeAmount)) {
        setStep('stake');
      }
      setIsVerifying(false);
    });
  };

  // If on stake step but allowance is gone (e.g. reorg), go back to approve
  useEffect(() => {
    if (step === 'stake' && !isVerifying && allowance != null && BigInt(allowance.toString()) < BigInt(stakeAmount)) {
      setStep('approve');
    }
  }, [step, allowance, stakeAmount, isVerifying]);

  // Stake success → done
  useEffect(() => {
    if (isStakeSuccess) {
      onSuccess();
    }
  }, [isStakeSuccess, onSuccess]);

  // Display errors
  useEffect(() => {
    if (approveError) {
      setError(getShortErrorMessage(approveError, 'Failed to approve USDC'));
    }
  }, [approveError]);

  useEffect(() => {
    if (stakeError) {
      setError(getShortErrorMessage(stakeError, 'Failed to stake USDC'));
      setIsProcessing(false);
    }
  }, [stakeError]);

  const handleApprove = () => {
    setError('');
    approveUSDC({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [STAKE_VAULT_ADDRESS, stakeAmount],
      chainId: targetChain.id,
    });
  };

  /**
   * Stake flow: save profile to DB first, then send stake transaction.
   * This ensures the developer record exists when the Staked event fires.
   */
  const handleStake = async () => {
    setError('');
    setIsProcessing(true);

    try {
      // Step 1: Save profile to database if not already saved
      const checkRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/developers/${address}`);
      if (!checkRes.ok) {
        // Developer doesn't exist yet — create profile
        const message = `Welcome to 0xElite!\n\nPlease sign this message to verify your wallet ownership.\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
        const signature = await signMessageAsync({ message });

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/developers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            message,
            signature,
            email: formData.email,
            githubUsername: formData.githubUsername || undefined,
            skills: formData.skills,
            bio: formData.bio || undefined,
            hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to save profile');
        }
      }

      // Step 2: Send stake transaction
      stakeTokens({
        address: STAKE_VAULT_ADDRESS,
        abi: STAKE_VAULT_ABI,
        functionName: 'stake',
        args: [stakeAmount],
        chainId: targetChain.id,
      });
    } catch (err) {
      setError(getShortErrorMessage(err, 'Failed to stake'));
      setIsProcessing(false);
    }
  };

  const isAllowanceSufficient = allowance != null && BigInt(allowance.toString()) >= BigInt(stakeAmount);
  const isStakeButtonDisabled = !isConfigured || isStakePending || isStaking || isProcessing;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Stake USDC to Activate Account</h2>

      {/* Configuration Error */}
      {!isConfigured && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500 rounded-lg">
          <p className="text-yellow-400 text-sm font-semibold mb-2">Contract Not Configured</p>
          <p className="text-yellow-300 text-xs">
            STAKE_VAULT_ADDRESS is not configured. Please set NEXT_PUBLIC_STAKE_VAULT_ADDRESS in your .env.local file.
          </p>
          <p className="text-yellow-300 text-xs mt-1">
            Current value: {STAKE_VAULT_ADDRESS}
          </p>
        </div>
      )}

      {/* Stake Amount Display */}
      <div className="bg-purple-600/20 border border-purple-500/30 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Required Stake</p>
            <p className="text-3xl font-bold text-white">
              {(Number(stakeAmount) / 1e6).toFixed(2)} USDC
            </p>
          </div>
          <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>
        <p className="text-gray-300 text-sm mt-4">
          This stake proves your commitment and prevents spam. It is gradually returned as you complete projects (50 USDC per 5 projects).
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {/* Step 1: Approve */}
        <div className={`p-6 rounded-xl border ${step === 'approve' ? 'bg-purple-600/10 border-purple-500' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${step !== 'approve' ? 'bg-green-600' : 'bg-purple-600'} text-white font-bold`}>
                {step !== 'approve' ? '\u2713' : '1'}
              </div>
              <div>
                <h3 className="text-white font-semibold">Approve USDC</h3>
                <p className="text-gray-400 text-sm">Allow StakeVault to transfer your USDC</p>
              </div>
            </div>
            {isAllowanceSufficient && (
              <span className="text-green-400 text-sm">{'\u2713'} Approved</span>
            )}
          </div>
          {step === 'approve' && !isAllowanceSufficient && (
            isVerifying ? (
              <button
                disabled
                className="w-full py-3 bg-purple-600 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Verifying...
              </button>
            ) : isApproveSuccess ? (
              <div className="space-y-2">
                <p className="text-yellow-400 text-sm">Insufficient allowance detected. Please retry.</p>
                <button
                  onClick={handleRetryVerify}
                  className="w-full py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700"
                >
                  Retry
                </button>
              </div>
            ) : (
              <button
                onClick={handleApprove}
                disabled={!isConfigured || isApprovePending || isApproving}
                className="w-full py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApprovePending || isApproving ? 'Approving...' : 'Approve USDC'}
              </button>
            )
          )}
        </div>

        {/* Step 2: Stake (saves profile first, then stakes) */}
        <div className={`p-6 rounded-xl border ${step === 'stake' ? 'bg-purple-600/10 border-purple-500' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${step === 'stake' ? 'bg-purple-600' : 'bg-white/20'} text-white font-bold`}>
              2
            </div>
            <div>
              <h3 className="text-white font-semibold">Stake USDC</h3>
              <p className="text-gray-400 text-sm">Sign to save your profile, then stake</p>
            </div>
          </div>
          {step === 'stake' && (
            <button
              onClick={handleStake}
              disabled={isStakeButtonDisabled}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing && !isStakePending && !isStaking
                ? 'Saving profile...'
                : isStakePending || isStaking
                  ? 'Staking...'
                  : 'Sign & Stake'}
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg overflow-hidden">
          <p className="text-red-400 text-sm break-words">{error}</p>
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={onBack}
        className="w-full py-3 bg-white/10 rounded-lg text-white font-semibold hover:bg-white/20"
        disabled={isProcessing || isApprovePending || isApproving || isStakePending || isStaking}
      >
        {'\u2190'} Back to Form
      </button>
    </div>
  );
}
