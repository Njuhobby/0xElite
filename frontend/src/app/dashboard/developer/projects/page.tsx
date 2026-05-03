'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';

interface Project {
  id: string;
  projectNumber: number;
  title: string;
  requiredSkills: string[];
  totalBudget: string;
  status: string;
  createdAt: string;
}

export default function DeveloperProjectsPage() {
  const { address } = useAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setProjects([]);
      setLoading(false);
      return;
    }
    fetchProjects();
  }, [address]);

  const fetchProjects = async () => {
    if (!address) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ developerAddress: address, limit: '50' });
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects?${params.toString()}`
      );
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      setProjects(data.projects);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const statusConfig: Record<string, { color: string; label: string }> = {
    deposited: { color: 'bg-violet-50 text-violet-700 border-violet-200', label: 'Awaiting Developer' },
    active: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In Progress' },
    completed: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Completed' },
    cancelled: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Cancelled' },
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
        <p className="text-gray-500 text-sm mt-1">View and manage your assigned projects</p>
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
          <p className="text-gray-500 text-sm">
            You haven&apos;t been assigned to any projects yet. Projects are matched
            automatically based on your skills — check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-violet-200 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    #{project.projectNumber} {project.title}
                  </h3>
                  {project.requiredSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {project.requiredSkills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded text-xs font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig[project.status]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {statusConfig[project.status]?.label || project.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Budget</p>
                  <p className="text-gray-900 font-semibold text-sm">${project.totalBudget} USDC</p>
                </div>
                <Link
                  href={`/dashboard/developer/projects/${project.id}`}
                  className="text-sm text-violet-600 hover:text-violet-700 font-medium"
                >
                  View Details &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
