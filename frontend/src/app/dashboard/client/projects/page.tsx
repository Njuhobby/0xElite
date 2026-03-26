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

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Draft' },
  open: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Open' },
  assigned: { color: 'bg-violet-50 text-violet-700 border-violet-200', label: 'Assigned' },
  in_progress: { color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'In Progress' },
  completed: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Completed' },
  cancelled: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Cancelled' },
  disputed: { color: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Disputed' },
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
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your projects and track progress</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 rounded-lg text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Project
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-violet-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">Loading projects...</span>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-violet-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
          <p className="text-gray-500 text-sm mb-6">
            {statusFilter !== 'all'
              ? `No projects with status "${statusFilter.replace('_', ' ')}".`
              : 'Create your first project to get started.'}
          </p>
          {statusFilter === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-5 py-2.5 bg-violet-600 rounded-lg text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className="text-gray-400 text-sm mb-3">{total} project{total !== 1 ? 's' : ''}</p>
          <div className="space-y-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/client/projects/${project.id}`}
                className="block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-violet-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{project.title}</h3>
                    <p className="text-gray-400 text-sm mt-0.5">
                      #{project.projectNumber} &middot; Created {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig[project.status]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {statusConfig[project.status]?.label || project.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-xs text-gray-400">Budget</p>
                      <p className="text-gray-900 font-semibold text-sm">{parseFloat(project.totalBudget).toFixed(2)} USDC</p>
                    </div>
                    {project.assignedDeveloper && (
                      <div>
                        <p className="text-xs text-gray-400">Developer</p>
                        <p className="text-gray-700 font-mono text-sm">
                          {project.assignedDeveloper.slice(0, 6)}...{project.assignedDeveloper.slice(-4)}
                        </p>
                      </div>
                    )}
                  </div>
                  <span className="text-violet-600 text-sm font-medium">View Details &rarr;</span>
                </div>

                {project.requiredSkills && project.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {project.requiredSkills.slice(0, 5).map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-0.5 bg-violet-50 border border-violet-200 rounded text-violet-700 text-xs font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                    {project.requiredSkills.length > 5 && (
                      <span className="text-gray-400 text-xs self-center">
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
