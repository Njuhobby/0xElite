'use client';

import { useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';

export default function ClientSettingsPage() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);

  const handleDisconnect = () => {
    disconnect();
    setShowConfirmDisconnect(false);
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account settings</p>
      </div>

      {/* Account Section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Account</h2>

        <div className="space-y-0 divide-y divide-gray-100">
          {/* Connected Wallet */}
          <div className="flex items-center justify-between py-4 first:pt-0">
            <div>
              <p className="text-sm font-medium text-gray-900">Connected Wallet</p>
              <p className="text-gray-400 text-sm font-mono mt-0.5">{address}</p>
            </div>
            <button
              onClick={() => setShowConfirmDisconnect(true)}
              className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm font-medium hover:bg-red-100 transition-colors"
            >
              Disconnect
            </button>
          </div>

          {/* Notifications */}
          <div className="py-4">
            <p className="text-sm font-medium text-gray-900 mb-1">Notifications</p>
            <p className="text-gray-500 text-sm mb-3">
              Email notifications for project updates and milestones (Coming soon)
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300 text-violet-600" />
                <span className="text-gray-700 text-sm">Milestone submissions</span>
              </label>
              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300 text-violet-600" />
                <span className="text-gray-700 text-sm">Project status changes</span>
              </label>
              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300 text-violet-600" />
                <span className="text-gray-700 text-sm">Escrow updates</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl border border-red-200 p-6">
        <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
        <div>
          <p className="text-sm font-medium text-gray-900 mb-1">Deactivate Account</p>
          <p className="text-gray-500 text-sm mb-4">
            Deactivate your client account. Active projects must be completed or cancelled first. (Coming soon)
          </p>
          <button
            disabled
            className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-400 text-sm font-medium opacity-50 cursor-not-allowed"
          >
            Deactivate Account
          </button>
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {showConfirmDisconnect && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Disconnect Wallet?</h3>
            <p className="text-gray-500 text-sm mb-6">
              You will be logged out and redirected to the home page. You can reconnect anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDisconnect}
                className="flex-1 py-2.5 bg-red-600 rounded-lg text-white text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={() => setShowConfirmDisconnect(false)}
                className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors"
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
