'use client';

import { useState } from 'react';
import { useAccount, useSignMessage, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useRouter } from 'next/navigation';
import { parseUnits, keccak256, encodePacked, Address } from 'viem';
import MilestoneManager from '@/components/project/MilestoneManager';
import { PROJECT_MANAGER_ABI, getProjectManagerAddress, getEscrowVaultAddress } from '@/config/contracts';

interface Milestone {
  title: string;
  description: string;
  deliverables: string[];
  budget: number;
}

const AVAILABLE_SKILLS = [
  'Solidity', 'Rust', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js',
  'Go', 'Python', 'DeFi', 'NFT', 'ZK-Proofs', 'Smart Contracts', 'Web3.js',
  'Ethers.js', 'Hardhat', 'Foundry', 'Subgraph', 'IPFS', 'Backend', 'Frontend'
];

// Contract addresses
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d') as Address;
const ESCROW_VAULT_ADDRESS = getEscrowVaultAddress();
const PROJECT_MANAGER_ADDRESS = getProjectManagerAddress();

// Minimal USDC ERC20 ABI (approve function)
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
] as const;

// Minimal EscrowVault ABI (deposit function)
const ESCROW_VAULT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Compute the detailsHash for a milestone, matching the on-chain encoding:
 * keccak256(abi.encodePacked(title, description, deliverablesJson))
 */
function computeMilestoneHash(milestone: Milestone): `0x${string}` {
  const deliverablesJson = JSON.stringify(milestone.deliverables.filter(d => d.trim()));
  return keccak256(encodePacked(
    ['string', 'string', 'string'],
    [milestone.title, milestone.description, deliverablesJson]
  ));
}

type DepositStep = 'form' | 'creating_onchain' | 'registering' | 'approving' | 'depositing' | 'recording' | 'completed';

export default function CreateProjectPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requiredSkills: [] as string[],
    totalBudget: '',
  });

  const [milestones, setMilestones] = useState<Milestone[]>([
    {
      title: '',
      description: '',
      deliverables: [''],
      budget: 0,
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [depositStep, setDepositStep] = useState<DepositStep>('form');
  const [createdProject, setCreatedProject] = useState<{ id: string; contractProjectId: string } | null>(null);

  const { signMessage } = useSignMessage();

  // V2: On-chain project creation transaction
  const {
    data: createHash,
    writeContract: createProjectOnChain,
    isPending: isCreatingOnChain,
    error: createError,
  } = useWriteContract();

  const { isLoading: isCreateTxPending, isSuccess: isCreateSuccess } = useWaitForTransactionReceipt({
    hash: createHash,
  });

  // USDC approval transaction
  const {
    data: approveHash,
    writeContract: approveUsdc,
    isPending: isApproving,
    error: approveError,
  } = useWriteContract();

  const { isLoading: isApproveTxPending } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Escrow deposit transaction
  const {
    data: depositHash,
    writeContract: depositEscrow,
    isPending: isDepositing,
    error: depositError,
  } = useWriteContract();

  const { isLoading: isDepositTxPending, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  const toggleSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      requiredSkills: prev.requiredSkills.includes(skill)
        ? prev.requiredSkills.filter(s => s !== skill)
        : [...prev.requiredSkills, skill]
    }));
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (!formData.title.trim()) errors.push('Project title is required');
    if (formData.title.length > 200) errors.push('Project title must be 200 characters or less');
    if (!formData.description.trim()) errors.push('Project description is required');
    if (formData.requiredSkills.length === 0) errors.push('At least one required skill must be selected');
    if (formData.requiredSkills.length > 10) errors.push('Maximum 10 required skills allowed');

    const totalBudget = parseFloat(formData.totalBudget);
    if (!formData.totalBudget || isNaN(totalBudget) || totalBudget < 100) {
      errors.push('Total budget must be at least 100 USDC');
    }

    if (milestones.length === 0) {
      errors.push('At least one milestone is required');
    } else {
      const milestoneBudgetSum = milestones.reduce((sum, m) => sum + m.budget, 0);
      if (Math.abs(milestoneBudgetSum - totalBudget) > 0.01) {
        errors.push(`Milestone budgets (${milestoneBudgetSum} USDC) must equal total budget (${totalBudget} USDC)`);
      }

      milestones.forEach((milestone, index) => {
        if (!milestone.title.trim()) errors.push(`Milestone ${index + 1}: Title is required`);
        if (!milestone.description.trim()) errors.push(`Milestone ${index + 1}: Description is required`);
        if (milestone.deliverables.filter(d => d.trim()).length === 0) {
          errors.push(`Milestone ${index + 1}: At least one deliverable is required`);
        }
        if (milestone.budget <= 0) errors.push(`Milestone ${index + 1}: Budget must be positive`);
      });
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const generateMessage = (action: string) => {
    const timestamp = Date.now();
    return `${action} on 0xElite

Wallet: ${address}
Timestamp: ${timestamp}`;
  };

  /**
   * V2: Register the on-chain project with the backend after tx confirms.
   * Backend extracts contractProjectId from tx receipt and stores project + milestones.
   */
  const registerProjectInBackend = async (txHash: string) => {
    try {
      setDepositStep('registering');
      setError('');

      const message = generateMessage('Register project');

      // Sign to authenticate with backend
      signMessage(
        { message },
        {
          onSuccess: async (signature) => {
            try {
              const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects/register`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    address,
                    message,
                    signature,
                    txHash,
                    title: formData.title,
                    description: formData.description,
                    requiredSkills: formData.requiredSkills,
                    totalBudget: parseFloat(formData.totalBudget),
                    milestones: milestones.map(m => ({
                      title: m.title,
                      description: m.description,
                      deliverables: m.deliverables.filter(d => d.trim()),
                      budget: m.budget,
                    })),
                  }),
                }
              );

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to register project');
              }

              const data = await response.json();

              setCreatedProject({
                id: data.id,
                contractProjectId: data.contractProjectId,
              });
              setDepositStep('approving');
              setIsSubmitting(false);
            } catch (err: any) {
              setError(err.message);
              setDepositStep('creating_onchain');
              setIsSubmitting(false);
            }
          },
          onError: (error) => {
            setError(error.message);
            setDepositStep('creating_onchain');
            setIsSubmitting(false);
          },
        }
      );
    } catch (err: any) {
      setError(err.message);
      setDepositStep('creating_onchain');
      setIsSubmitting(false);
    }
  };

  const handleApproveUsdc = async () => {
    if (!createdProject) return;

    try {
      setError('');
      const amountUsdc = parseUnits(formData.totalBudget, 6); // USDC has 6 decimals

      approveUsdc({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ESCROW_VAULT_ADDRESS, amountUsdc],
      });
    } catch (err: any) {
      setError(err.message);
      setDepositStep('form');
    }
  };

  const handleDepositEscrow = async () => {
    if (!createdProject) return;

    try {
      setError('');
      setDepositStep('depositing');
      const amountUsdc = parseUnits(formData.totalBudget, 6);

      depositEscrow({
        address: ESCROW_VAULT_ADDRESS,
        abi: ESCROW_VAULT_ABI,
        functionName: 'deposit',
        args: [BigInt(createdProject.contractProjectId), amountUsdc],
      });
    } catch (err: any) {
      setError(err.message);
      setDepositStep('approving');
    }
  };

  const recordDepositInBackend = async (txHash: string) => {
    if (!createdProject) return;

    try {
      setError('');
      setDepositStep('recording');

      const message = `Record escrow deposit for project ${createdProject.id}\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;

      signMessage(
        { message },
        {
          onSuccess: async (signature) => {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/escrow/deposit`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  address,
                  message,
                  signature,
                  projectId: createdProject.id,
                  amount: parseFloat(formData.totalBudget),
                  txHash,
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Failed to record deposit');
            }

            setDepositStep('completed');

            // Redirect after a short delay
            setTimeout(() => {
              router.push(`/projects/${createdProject.id}`);
            }, 2000);
          },
          onError: (error) => {
            setError(error.message);
            setDepositStep('depositing');
          },
        }
      );
    } catch (err: any) {
      setError(err.message);
      setDepositStep('depositing');
    }
  };

  // Effect to handle on-chain project creation confirmation
  if (createHash && isCreateSuccess && depositStep === 'creating_onchain') {
    registerProjectInBackend(createHash);
  }

  // Effect to handle approval confirmation
  if (approveHash && !isApproveTxPending && depositStep === 'approving') {
    handleDepositEscrow();
  }

  // Effect to handle deposit confirmation
  if (depositHash && isDepositSuccess && depositStep === 'depositing') {
    recordDepositInBackend(depositHash);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors([]);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setDepositStep('creating_onchain');

    // V2: Client wallet calls createProjectWithMilestones directly on-chain
    const totalBudgetUsdc = parseUnits(formData.totalBudget, 6);
    const milestoneBudgets = milestones.map(m => parseUnits(m.budget.toFixed(6), 6));
    const milestoneHashes = milestones.map(m => computeMilestoneHash(m));

    createProjectOnChain({
      address: PROJECT_MANAGER_ADDRESS,
      abi: PROJECT_MANAGER_ABI,
      functionName: 'createProjectWithMilestones',
      args: [totalBudgetUsdc, milestoneBudgets, milestoneHashes],
    });
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Connect Wallet</h1>
          <p className="text-gray-400">Please connect your wallet to create a project</p>
        </div>
      </div>
    );
  }

  // Show progress flow after form submission
  if (depositStep !== 'form') {
    const isAfterRegistration = depositStep === 'approving' || depositStep === 'depositing' || depositStep === 'recording' || depositStep === 'completed';
    const isAfterDeposit = depositStep === 'recording' || depositStep === 'completed';

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
            <h1 className="text-3xl font-bold text-white mb-6 text-center">
              {isAfterRegistration ? 'Deposit Escrow' : 'Creating Project On-Chain'}
            </h1>
            <p className="text-gray-400 text-center mb-8">
              {isAfterRegistration
                ? `Deposit ${formData.totalBudget} USDC to escrow to activate your project`
                : 'Your project and milestones are being recorded on the blockchain'}
            </p>

            {/* Progress Steps */}
            <div className="space-y-4 mb-8">
              {/* Step 1: Create On-Chain */}
              <div className={`flex items-center p-4 rounded-xl ${
                depositStep === 'creating_onchain' ? 'bg-purple-600/20 border border-purple-500' :
                depositStep === 'registering' || isAfterRegistration ?
                'bg-green-600/20 border border-green-500' :
                'bg-white/5 border border-white/10'
              }`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold mr-4">
                  {depositStep === 'registering' || isAfterRegistration ? '✓' : '1'}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold">Create Project On-Chain</h3>
                  <p className="text-gray-400 text-sm">Sign transaction to create project with milestones on-chain</p>
                </div>
                {depositStep === 'creating_onchain' && (isCreatingOnChain || isCreateTxPending) && (
                  <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                )}
              </div>

              {/* Step 2: Register with Backend */}
              <div className={`flex items-center p-4 rounded-xl ${
                depositStep === 'registering' ? 'bg-purple-600/20 border border-purple-500' :
                isAfterRegistration ?
                'bg-green-600/20 border border-green-500' :
                'bg-white/5 border border-white/10'
              }`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold mr-4">
                  {isAfterRegistration ? '✓' : '2'}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold">Register Project</h3>
                  <p className="text-gray-400 text-sm">Record project details in the platform</p>
                </div>
                {depositStep === 'registering' && (
                  <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                )}
              </div>

              {/* Step 3: Approve USDC */}
              <div className={`flex items-center p-4 rounded-xl ${
                depositStep === 'approving' ? 'bg-purple-600/20 border border-purple-500' :
                depositStep === 'depositing' || isAfterDeposit ?
                'bg-green-600/20 border border-green-500' :
                'bg-white/5 border border-white/10'
              }`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold mr-4">
                  {depositStep === 'depositing' || isAfterDeposit ? '✓' : '3'}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold">Approve USDC</h3>
                  <p className="text-gray-400 text-sm">Allow EscrowVault to spend your USDC</p>
                </div>
                {depositStep === 'approving' && (isApproving || isApproveTxPending) && (
                  <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                )}
              </div>

              {/* Step 4: Deposit */}
              <div className={`flex items-center p-4 rounded-xl ${
                depositStep === 'depositing' ? 'bg-purple-600/20 border border-purple-500' :
                isAfterDeposit ?
                'bg-green-600/20 border border-green-500' :
                'bg-white/5 border border-white/10'
              }`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold mr-4">
                  {isAfterDeposit ? '✓' : '4'}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold">Deposit to Escrow</h3>
                  <p className="text-gray-400 text-sm">Transfer USDC to escrow vault</p>
                </div>
                {depositStep === 'depositing' && (isDepositing || isDepositTxPending) && (
                  <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                )}
              </div>

              {/* Step 5: Confirm */}
              <div className={`flex items-center p-4 rounded-xl ${
                depositStep === 'recording' ? 'bg-purple-600/20 border border-purple-500' :
                depositStep === 'completed' ?
                'bg-green-600/20 border border-green-500' :
                'bg-white/5 border border-white/10'
              }`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold mr-4">
                  {depositStep === 'completed' ? '✓' : '5'}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold">Activate Project</h3>
                  <p className="text-gray-400 text-sm">Record deposit and activate project</p>
                </div>
                {depositStep === 'recording' && (
                  <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                )}
              </div>
            </div>

            {/* Success Message */}
            {depositStep === 'completed' && (
              <div className="bg-green-500/10 border border-green-500 rounded-xl p-4 mb-4">
                <p className="text-green-400 text-center font-semibold">
                  Escrow deposited successfully! Redirecting to your project...
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500 rounded-xl p-4 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Action Button */}
            {depositStep === 'approving' && !isApproving && !isApproveTxPending && (
              <button
                onClick={handleApproveUsdc}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-bold text-lg hover:shadow-lg transition-all"
              >
                Approve USDC
              </button>
            )}

            {(createError || approveError || depositError) && (
              <div className="text-center mt-4">
                <button
                  onClick={() => {
                    setError('');
                    setDepositStep('form');
                    setIsSubmitting(false);
                  }}
                  className="text-purple-400 hover:text-purple-300 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">Create New Project</h1>
        <p className="text-gray-400 mb-8">Post your project and get matched with elite Web3 developers automatically</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Project Title */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Project Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="e.g., DeFi Dashboard Frontend"
              maxLength={200}
            />
            <p className="text-gray-400 text-sm mt-1">{formData.title.length}/200</p>
          </div>

          {/* Project Description */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Project Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-32 resize-none"
              placeholder="Describe what you need built, key features, and any specific requirements..."
            />
          </div>

          {/* Required Skills */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Required Skills *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {AVAILABLE_SKILLS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    formData.requiredSkills.includes(skill)
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <p className="text-gray-400 text-sm">Selected: {formData.requiredSkills.length}/10</p>
          </div>

          {/* Total Budget */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Total Budget (USDC) *</label>
            <div className="flex items-center">
              <span className="text-gray-400 mr-2 text-xl">$</span>
              <input
                type="number"
                value={formData.totalBudget}
                onChange={(e) => setFormData({ ...formData, totalBudget: e.target.value })}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="5000"
                min="100"
                step="0.01"
              />
              <span className="text-gray-400 ml-2">USDC</span>
            </div>
            <p className="text-gray-400 text-sm mt-1">Minimum: 100 USDC</p>
          </div>

          {/* Milestones */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Project Milestones *</h2>
            <p className="text-gray-400 mb-6">Break your project into milestones with individual budgets and deliverables</p>

            <MilestoneManager
              milestones={milestones}
              onChange={setMilestones}
              totalBudget={parseFloat(formData.totalBudget) || 0}
            />
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500 rounded-xl p-4">
              <h3 className="text-red-400 font-semibold mb-2">Please fix the following errors:</h3>
              <ul className="list-disc list-inside text-red-400 text-sm space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-xl p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-bold text-lg hover:shadow-lg disabled:opacity-50 transition-all"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating Project...' : 'Create Project & Find Developer'}
          </button>
        </form>
      </div>
    </div>
  );
}
