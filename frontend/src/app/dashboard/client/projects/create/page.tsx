'use client';

import { useState, useRef, useEffect } from 'react';
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

const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d') as Address;
const ESCROW_VAULT_ADDRESS = getEscrowVaultAddress();
const PROJECT_MANAGER_ADDRESS = getProjectManagerAddress();

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

function computeMilestoneHash(milestone: Milestone): `0x${string}` {
  const deliverablesJson = JSON.stringify(milestone.deliverables.filter(d => d.trim()));
  return keccak256(encodePacked(
    ['string', 'string', 'string'],
    [milestone.title, milestone.description, deliverablesJson]
  ));
}

type DepositStep = 'form' | 'creating_onchain' | 'registering' | 'approving' | 'depositing' | 'recording' | 'completed';

export default function CreateProjectPage() {
  const { address } = useAccount();
  const router = useRouter();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requiredSkills: [] as string[],
    totalBudget: '',
  });

  const [milestones, setMilestones] = useState<Milestone[]>([
    { title: '', description: '', deliverables: [''], budget: 0 },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [depositStep, setDepositStep] = useState<DepositStep>('form');
  const [createdProject, setCreatedProject] = useState<{ id: string; contractProjectId: string } | null>(null);

  // Guard to prevent duplicate calls during re-renders
  const transitioningRef = useRef(false);
  const prevStepRef = useRef<DepositStep>('form');

  const { signMessage } = useSignMessage();

  const {
    data: createHash,
    writeContract: createProjectOnChain,
    isPending: isCreatingOnChain,
    error: createError,
  } = useWriteContract();

  const { isLoading: isCreateTxPending, isSuccess: isCreateSuccess } = useWaitForTransactionReceipt({
    hash: createHash,
  });

  const {
    data: approveHash,
    writeContract: approveUsdc,
    isPending: isApproving,
    error: approveError,
  } = useWriteContract();

  const { isLoading: isApproveTxPending } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

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
    return `${action} on 0xElite\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
  };

  const registerProjectInBackend = async (txHash: string) => {
    try {
      setDepositStep('registering');
      setError('');

      const message = generateMessage('Register project');

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
            } catch (err) {
              setError(err instanceof Error ? err.message : 'An error occurred');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setDepositStep('creating_onchain');
      setIsSubmitting(false);
    }
  };

  const handleApproveUsdc = async () => {
    if (!createdProject) return;
    try {
      setError('');
      const amountUsdc = parseUnits(formData.totalBudget, 6);
      approveUsdc({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ESCROW_VAULT_ADDRESS, amountUsdc],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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
            try {
              const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/escrow/deposit`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
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
                setError(errorData.message || 'Failed to record deposit');
                setDepositStep('depositing');
                return;
              }

              setDepositStep('completed');
              setTimeout(() => {
                router.push(`/dashboard/client/projects/${createdProject.id}`);
              }, 2000);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to record deposit');
              setDepositStep('depositing');
            }
          },
          onError: (error) => {
            setError(error.message);
            setDepositStep('depositing');
          },
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setDepositStep('depositing');
    }
  };

  // Reset guard when step actually changes
  useEffect(() => {
    if (depositStep !== prevStepRef.current) {
      prevStepRef.current = depositStep;
      transitioningRef.current = false;
    }
  }, [depositStep]);

  // Effect to handle on-chain project creation confirmation
  useEffect(() => {
    if (createHash && isCreateSuccess && depositStep === 'creating_onchain' && !transitioningRef.current) {
      transitioningRef.current = true;
      registerProjectInBackend(createHash);
    }
  }, [createHash, isCreateSuccess, depositStep]);

  // Effect to handle approval confirmation
  useEffect(() => {
    if (approveHash && !isApproveTxPending && depositStep === 'approving' && !transitioningRef.current) {
      transitioningRef.current = true;
      handleDepositEscrow();
    }
  }, [approveHash, isApproveTxPending, depositStep]);

  // Effect to handle deposit confirmation
  useEffect(() => {
    if (depositHash && isDepositSuccess && depositStep === 'depositing' && !transitioningRef.current) {
      transitioningRef.current = true;
      recordDepositInBackend(depositHash);
    }
  }, [depositHash, isDepositSuccess, depositStep]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors([]);

    if (!validateForm()) return;

    setIsSubmitting(true);
    setDepositStep('creating_onchain');

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

  // Progress flow after form submission
  if (depositStep !== 'form') {
    const isAfterRegistration = depositStep === 'approving' || depositStep === 'depositing' || depositStep === 'recording' || depositStep === 'completed';
    const isAfterDeposit = depositStep === 'recording' || depositStep === 'completed';

    const steps = [
      { key: 'creating_onchain', label: 'Create Project On-Chain', desc: 'Sign transaction to create project with milestones on-chain', done: depositStep === 'registering' || isAfterRegistration, active: depositStep === 'creating_onchain', spinning: depositStep === 'creating_onchain' && (isCreatingOnChain || isCreateTxPending) },
      { key: 'registering', label: 'Register Project', desc: 'Record project details in the platform', done: isAfterRegistration, active: depositStep === 'registering', spinning: depositStep === 'registering' },
      { key: 'approving', label: 'Approve USDC', desc: 'Allow EscrowVault to spend your USDC', done: depositStep === 'depositing' || isAfterDeposit, active: depositStep === 'approving', spinning: depositStep === 'approving' && (isApproving || isApproveTxPending) },
      { key: 'depositing', label: 'Deposit to Escrow', desc: 'Transfer USDC to escrow vault', done: isAfterDeposit, active: depositStep === 'depositing', spinning: depositStep === 'depositing' && (isDepositing || isDepositTxPending) },
      { key: 'recording', label: 'Activate Project', desc: 'Record deposit and activate project', done: depositStep === 'completed', active: depositStep === 'recording', spinning: depositStep === 'recording' },
    ];

    return (
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {isAfterRegistration ? 'Deposit Escrow' : 'Creating Project On-Chain'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isAfterRegistration
              ? `Deposit ${formData.totalBudget} USDC to escrow to activate your project`
              : 'Your project and milestones are being recorded on the blockchain'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="space-y-3 mb-6">
            {steps.map((step, i) => (
              <div
                key={step.key}
                className={`flex items-center p-4 rounded-xl border ${
                  step.done ? 'bg-green-50 border-green-200' :
                  step.active ? 'bg-violet-50 border-violet-300' :
                  'bg-gray-50 border-gray-200'
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold mr-4 ${
                  step.done ? 'bg-green-500' : step.active ? 'bg-violet-600' : 'bg-gray-300'
                }`}>
                  {step.done ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold text-sm ${step.done ? 'text-green-800' : step.active ? 'text-violet-900' : 'text-gray-500'}`}>
                    {step.label}
                  </h3>
                  <p className={`text-xs mt-0.5 ${step.done ? 'text-green-600' : step.active ? 'text-violet-600' : 'text-gray-400'}`}>
                    {step.desc}
                  </p>
                </div>
                {step.spinning && (
                  <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            ))}
          </div>

          {depositStep === 'completed' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-4">
              <p className="text-green-700 text-center font-semibold text-sm">
                Escrow deposited successfully! Redirecting to your project...
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {depositStep === 'approving' && !isApproving && !isApproveTxPending && (
            <button
              onClick={handleApproveUsdc}
              className="w-full py-3 bg-violet-600 rounded-xl text-white font-semibold hover:bg-violet-700 transition-colors"
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
                className="text-violet-600 hover:text-violet-700 underline text-sm font-medium"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
        <p className="text-gray-500 text-sm mt-1">Post your project and get matched with elite Web3 developers automatically</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Title *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            placeholder="e.g., DeFi Dashboard Frontend"
            maxLength={200}
          />
          <p className="text-gray-400 text-xs mt-1">{formData.title.length}/200</p>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Description *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 h-28 resize-none"
            placeholder="Describe what you need built, key features, and any specific requirements..."
          />
        </div>

        {/* Required Skills */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Required Skills *</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {AVAILABLE_SKILLS.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formData.requiredSkills.includes(skill)
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
          <p className="text-gray-400 text-xs">Selected: {formData.requiredSkills.length}/10</p>
        </div>

        {/* Total Budget */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Total Budget (USDC) *</label>
          <input
            type="number"
            value={formData.totalBudget}
            onChange={(e) => setFormData({ ...formData, totalBudget: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            placeholder="Min 100 USDC"
            min="100"
            step="0.01"
          />
        </div>

        {/* Milestones */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Project Milestones *</h2>
          <p className="text-gray-500 text-sm mb-5">Break your project into milestones with individual budgets and deliverables</p>

          <MilestoneManager
            milestones={milestones}
            onChange={setMilestones}
            totalBudget={parseFloat(formData.totalBudget) || 0}
          />
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <h3 className="text-red-700 font-semibold text-sm mb-2">Please fix the following errors:</h3>
            <ul className="list-disc list-inside text-red-600 text-sm space-y-1">
              {validationErrors.map((err, index) => (
                <li key={index}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          className="w-full py-3 bg-violet-600 rounded-xl text-white font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating Project...' : 'Create Project & Deposit Escrow'}
        </button>
      </form>
    </div>
  );
}
