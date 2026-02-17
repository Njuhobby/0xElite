'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import CreateProjectModal from '@/components/client/CreateProjectModal';

interface Project {
  id: string;
  projectNumber: number;
  title: string;
  requiredSkills: string[];
  totalBudget: string;
  status: string;
  assignedDeveloper: string | null;
  createdAt: string;
}

const STATUS_FILTERS = ['all', 'draft', 'open', 'assigned', 'in_progress', 'completed', 'cancelled', 'disputed'] as const;

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500',
  open: 'bg-blue-500',
  assigned: 'bg-purple-500',
  in_progress: 'bg-yellow-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
  disputed: 'bg-orange-500',
};

export default function ClientProjectsPage() {
  const { address } = useAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (address) {
      fetchProjects();
    }
  }, [address, statusFilter]);

  const fetchProjects = async () => {
    if (!address) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        clientAddress: address,
        limit: '50',
        offset: '0',
      });
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects?${params}`
      );

      if (!response.ok) throw new Error('Failed to fetch projects');

      const data = await response.json();
      setProjects(data.projects);
      setTotal(data.total);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">My Projects</h1>
          <p className="text-gray-300">Manage your projects and track progress</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg transition-shadow"
        >
          Create Project
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-white text-xl">Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-12 text-center">
          <div className="w-16 h-16 bg-purple-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Projects Yet</h3>
          <p className="text-gray-400 mb-6">
            {statusFilter !== 'all'
              ? `No projects with status "${statusFilter.replace('_', ' ')}".`
              : 'Create your first project to get started.'}
          </p>
          {statusFilter === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg transition-shadow"
            >
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className="text-gray-400 text-sm mb-4">{total} project{total !== 1 ? 's' : ''}</p>
          <div className="space-y-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/client/projects/${project.id}`}
                className="block bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-1">{project.title}</h3>
                    <p className="text-gray-400 text-sm">
                      #{project.projectNumber} &middot; Created {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${statusColors[project.status] || 'bg-gray-500'}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-gray-400 text-sm">Budget</p>
                      <p className="text-white font-semibold">{parseFloat(project.totalBudget).toFixed(2)} USDC</p>
                    </div>
                    {project.assignedDeveloper && (
                      <div>
                        <p className="text-gray-400 text-sm">Developer</p>
                        <p className="text-white font-mono text-sm">
                          {project.assignedDeveloper.slice(0, 6)}...{project.assignedDeveloper.slice(-4)}
                        </p>
                      </div>
                    )}
                  </div>
                  <span className="text-purple-400 text-sm font-medium">View Details →</span>
                </div>

                {project.requiredSkills && project.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {project.requiredSkills.slice(0, 5).map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-1 bg-purple-600/20 border border-purple-500/30 rounded text-purple-300 text-xs"
                      >
                        {skill}
                      </span>
                    ))}
                    {project.requiredSkills.length > 5 && (
                      <span className="text-gray-500 text-xs self-center">
                        +{project.requiredSkills.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchProjects();
          }}
        />
      )}
    </div>
  );
}
