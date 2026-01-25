'use client';

import { useState } from 'react';
import { useWriteContract, useReadContract, useWaitForTransactionReceipt, useSignMessage } from 'wagmi';
import { parseUnits, Address } from 'viem';

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

interface Props {
  address: string;
  formData: any;
  onBack: () => void;
  onSuccess: () => void;
}

export default function StakeFlow({ address, formData, onBack, onSuccess }: Props) {
  const [step, setStep] = useState<'approve' | 'stake' | 'submit'>('approve');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');

  // Read required stake amount
  const { data: requiredStake } = useReadContract({
    address: STAKE_VAULT_ADDRESS,
    abi: STAKE_VAULT_ABI,
    functionName: 'requiredStake',
  });

  const stakeAmount = requiredStake || parseUnits('150', 6); // Default 150 USDC

  // Check USDC allowance
  const { data: allowance } = useReadContract({
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
  } = useWriteContract();

  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Stake
  const {
    data: stakeHash,
    writeContract: stakeTokens,
    isPending: isStakePending,
  } = useWriteContract();

  const { isLoading: isStaking, isSuccess: isStakeSuccess } = useWaitForTransactionReceipt({
    hash: stakeHash,
  });

  // Auto-advance to next step after successful transactions
  if (isApproveSuccess && step === 'approve') {
    setStep('stake');
  }

  if (isStakeSuccess && step === 'stake') {
    setStep('submit');
  }

  // Sign message for backend
  const { signMessage } = useSignMessage({
    onSuccess: async (signature) => {
      await submitProfile(signature);
    },
  });

  const generateMessage = () => {
    const timestamp = Date.now();
    return `Welcome to 0xElite!

Please sign this message to verify your wallet ownership.

Wallet: ${address}
Timestamp: ${timestamp}`;
  };

  const submitProfile = async (signature: string) => {
    setIsProcessing(true);
    setError('');

    try {
      const message = generateMessage();

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/developers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        throw new Error(errorData.message || 'Failed to create profile');
      }

      // Success!
      onSuccess();
    } catch (err: any) {
      console.error('Profile submission error:', err);
      setError(err.message || 'Failed to submit profile');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = () => {
    setError('');
    approveUSDC({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [STAKE_VAULT_ADDRESS, stakeAmount],
    });
  };

  const handleStake = () => {
    setError('');
    stakeTokens({
      address: STAKE_VAULT_ADDRESS,
      abi: STAKE_VAULT_ABI,
      functionName: 'stake',
      args: [stakeAmount],
    });
  };

  const handleSubmit = () => {
    setError('');
    const message = generateMessage();
    signMessage({ message });
  };

  const isAllowanceSufficient = allowance && BigInt(allowance as any) >= BigInt(stakeAmount);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Stake USDC to Activate Account</h2>

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
          This stake proves your commitment and prevents spam. You can unstake after completing 10 projects.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {/* Step 1: Approve */}
        <div className={`p-6 rounded-xl border ${step === 'approve' ? 'bg-purple-600/10 border-purple-500' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${step !== 'approve' ? 'bg-green-600' : 'bg-purple-600'} text-white font-bold`}>
                {step !== 'approve' ? '✓' : '1'}
              </div>
              <div>
                <h3 className="text-white font-semibold">Approve USDC</h3>
                <p className="text-gray-400 text-sm">Allow StakeVault to transfer your USDC</p>
              </div>
            </div>
            {isAllowanceSufficient && (
              <span className="text-green-400 text-sm">✓ Approved</span>
            )}
          </div>
          {step === 'approve' && !isAllowanceSufficient && (
            <button
              onClick={handleApprove}
              disabled={isApprovePending || isApproving}
              className="w-full py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApprovePending || isApproving ? 'Approving...' : 'Approve USDC'}
            </button>
          )}
        </div>

        {/* Step 2: Stake */}
        <div className={`p-6 rounded-xl border ${step === 'stake' ? 'bg-purple-600/10 border-purple-500' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${step === 'submit' ? 'bg-green-600' : step === 'stake' ? 'bg-purple-600' : 'bg-white/20'} text-white font-bold`}>
                {step === 'submit' ? '✓' : '2'}
              </div>
              <div>
                <h3 className="text-white font-semibold">Stake USDC</h3>
                <p className="text-gray-400 text-sm">Lock your stake in the contract</p>
              </div>
            </div>
          </div>
          {step === 'stake' && (
            <button
              onClick={handleStake}
              disabled={isStakePending || isStaking}
              className="w-full py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStakePending || isStaking ? 'Staking...' : 'Stake USDC'}
            </button>
          )}
        </div>

        {/* Step 3: Submit Profile */}
        <div className={`p-6 rounded-xl border ${step === 'submit' ? 'bg-purple-600/10 border-purple-500' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${step === 'submit' ? 'bg-purple-600' : 'bg-white/20'} text-white font-bold`}>
              3
            </div>
            <div>
              <h3 className="text-white font-semibold">Submit Profile</h3>
              <p className="text-gray-400 text-sm">Sign message to create your profile</p>
            </div>
          </div>
          {step === 'submit' && (
            <button
              onClick={handleSubmit}
              disabled={isProcessing}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Submitting...' : 'Sign & Submit Profile'}
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={onBack}
        className="w-full py-3 bg-white/10 rounded-lg text-white font-semibold hover:bg-white/20"
        disabled={isProcessing || isApprovePending || isApproving || isStakePending || isStaking}
      >
        ← Back to Form
      </button>
    </div>
  );
}
