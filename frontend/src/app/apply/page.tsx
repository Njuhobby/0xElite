'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import DeveloperApplicationForm from '@/components/developer/DeveloperApplicationForm';
import StakeFlow from '@/components/developer/StakeFlow';

export default function ApplyPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'stake'>('form');
  const [formData, setFormData] = useState<any>(null);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Connect Your Wallet</h1>
          <p className="text-gray-300 mb-6">
            Please connect your wallet to apply as a developer
          </p>
          <div className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl flex items-center justify-center text-white font-semibold opacity-50 cursor-not-allowed">
            Wallet Not Connected
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Join as a <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Developer</span>
          </h1>
          <p className="text-gray-300 text-lg">
            Complete your profile and stake 150 USDC to get started
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step === 'form' ? 'bg-purple-600' : 'bg-green-600'} text-white font-bold`}>
              {step === 'stake' ? '✓' : '1'}
            </div>
            <div className="text-white ml-3 mr-8">Profile</div>
          </div>
          <div className={`h-1 w-24 ${step === 'stake' ? 'bg-purple-600' : 'bg-white/20'}`}></div>
          <div className="flex items-center ml-8">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step === 'stake' ? 'bg-purple-600' : 'bg-white/20'} text-white font-bold`}>
              2
            </div>
            <div className="text-white ml-3">Stake</div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
          {step === 'form' ? (
            <DeveloperApplicationForm
              address={address!}
              onSubmit={(data) => {
                setFormData(data);
                setStep('stake');
              }}
            />
          ) : (
            <StakeFlow
              address={address!}
              formData={formData}
              onBack={() => setStep('form')}
              onSuccess={() => {
                router.push(`/developers/${address}`);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
