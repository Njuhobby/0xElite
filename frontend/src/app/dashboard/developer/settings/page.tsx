'use client';

import { useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';

export default function DeveloperSettingsPage() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);

  const handleDisconnect = () => {
    disconnect();
    setShowConfirmDisconnect(false);
    // Redirect will happen automatically via layout's useEffect
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-gray-300">Manage your account settings and preferences</p>
      </div>

      {/* Account Section */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-6">
        <h2 className="text-xl font-semibold text-white mb-6">Account</h2>

        <div className="space-y-4">
          {/* Connected Wallet */}
          <div className="flex items-center justify-between py-4 border-b border-white/10">
            <div>
              <p className="text-white font-medium mb-1">Connected Wallet</p>
              <p className="text-gray-400 text-sm font-mono">{address}</p>
            </div>
            <button
              onClick={() => setShowConfirmDisconnect(true)}
              className="px-4 py-2 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400 font-medium hover:bg-red-600/30 transition-colors"
            >
              Disconnect
            </button>
          </div>

          {/* Availability Status */}
          <div className="py-4 border-b border-white/10">
            <p className="text-white font-medium mb-3">Availability Status</p>
            <p className="text-gray-400 text-sm mb-4">
              Control your availability for new project assignments. You can update this from your profile.
            </p>
            <div className="flex gap-3">
              <span className="px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-sm">
                Available
              </span>
              <span className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 text-sm">
                Busy
              </span>
              <span className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 text-sm">
                Vacation
              </span>
            </div>
          </div>

          {/* Notifications (Placeholder) */}
          <div className="py-4">
            <p className="text-white font-medium mb-3">Notifications</p>
            <p className="text-gray-400 text-sm mb-4">
              Email notifications for project updates and messages (Coming soon)
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input type="checkbox" disabled className="w-5 h-5 rounded border-white/20" />
                <span className="text-gray-300">New project assignments</span>
              </label>
              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input type="checkbox" disabled className="w-5 h-5 rounded border-white/20" />
                <span className="text-gray-300">Project updates</span>
              </label>
              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input type="checkbox" disabled className="w-5 h-5 rounded border-white/20" />
                <span className="text-gray-300">Payment notifications</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/10 backdrop-blur-lg rounded-2xl border border-red-500/30 p-8">
        <h2 className="text-xl font-semibold text-red-400 mb-4">Danger Zone</h2>

        <div className="space-y-4">
          <div>
            <p className="text-white font-medium mb-2">Deactivate Account</p>
            <p className="text-gray-400 text-sm mb-4">
              Temporarily deactivate your developer account. You can reactivate it later. (Coming soon)
            </p>
            <button
              disabled
              className="px-4 py-2 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400 font-medium opacity-50 cursor-not-allowed"
            >
              Deactivate Account
            </button>
          </div>
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {showConfirmDisconnect && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a0a2e] border border-white/10 rounded-2xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-bold text-white mb-4">Disconnect Wallet?</h3>
            <p className="text-gray-300 mb-6">
              You will be logged out and redirected to the home page. You can reconnect anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDisconnect}
                className="flex-1 py-3 bg-red-600 rounded-lg text-white font-semibold hover:bg-red-700 transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={() => setShowConfirmDisconnect(false)}
                className="flex-1 py-3 bg-white/10 rounded-lg text-white font-semibold hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
